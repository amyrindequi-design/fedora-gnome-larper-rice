import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';

const MPRIS_ROOT_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
  </interface>
</node>`;

const MPRIS_PLAYER_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="PlayPause"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Position" type="x" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
  </interface>
</node>`;

const MprisRootProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_ROOT_XML);
const MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_XML);

function formatMicros(us) {
    if (!Number.isFinite(us) || us <= 0)
        return '00:00';
    const totalSec = Math.floor(us / 1000000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}

/**
 * Animated 5-bar Cairo equalizer rendered inside the top bar glass pill.
 */
const SpectrumBars = GObject.registerClass(
class SpectrumBars extends St.DrawingArea {
    _init() {
        super._init({
            width: 20,
            height: 14,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._playing = false;
        this._hasPlayer = false;
        this._phase = 0.0;
        this._timerId = 0;
        this.connect('repaint', this._onRepaint.bind(this));
        this.connect('destroy', () => this._stopTimer());
    }

    setState(hasPlayer, playing) {
        const changed = this._hasPlayer !== hasPlayer || this._playing !== playing;
        this._hasPlayer = hasPlayer;
        this._playing = playing;

        if (playing && !this._timerId) {
            this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._phase += 0.22;
                this.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!playing) {
            this._stopTimer();
        }

        if (changed || !playing)
            this.queue_repaint();
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _onRepaint() {
        const cr = this.get_context();
        try {
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);

            const [w, h] = this.get_surface_size();
            const bars = 5;
            const barW = 2.2;
            const gap = 1.8;
            const totalW = bars * barW + (bars - 1) * gap;
            const x0 = Math.max(0, (w - totalW) * 0.5);
            const r = barW * 0.5;

            for (let i = 0; i < bars; i++) {
                let frac;
                if (!this._hasPlayer) {
                    frac = 0.28 + (i % 2) * 0.16;
                } else if (!this._playing) {
                    frac = 0.34 + ((i * 2) % 3) * 0.14;
                } else {
                    const wave1 = Math.sin(this._phase * 1.35 + i * 0.95);
                    const wave2 = Math.cos(this._phase * 2.0 - i * 1.3);
                    frac = 0.26 + Math.abs(wave1 * 0.44 + wave2 * 0.34);
                }

                const barH = Math.max(barW + 1, Math.min(h - 1, (h - 1) * frac));
                const bx = x0 + i * (barW + gap);
                const by = (h - barH) * 0.5;
                const alpha = !this._hasPlayer ? 0.42 : (this._playing ? 0.92 : 0.62);

                cr.setSourceRGBA(1.0, 1.0, 1.0, alpha);
                cr.newSubPath();
                cr.arc(bx + r, by + r, r, Math.PI, 0);
                cr.arc(bx + r, by + barH - r, r, 0, Math.PI);
                cr.closePath();
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    }
});

/**
 * Represents one active MPRIS player on session D-Bus.
 */
class MprisClient {
    constructor(busName, onChanged) {
        this.busName = busName;
        this._onChanged = onChanged;
        this._destroyed = false;

        this.identity = busName.replace(MPRIS_PREFIX, '').split('.')[0] || 'Player';
        this.status = 'Stopped';
        this.title = '';
        this.artist = '';
        this.album = '';
        this.artUrl = '';
        this.lengthUs = 0;
        this.positionUs = 0;
        this.canPlay = true;
        this.canGoNext = true;
        this.canGoPrev = true;

        this._rootProxy = null;
        this._playerProxy = null;
        this._playerSigId = 0;
        this._rootSigId = 0;

        new MprisRootProxy(
            Gio.DBus.session,
            busName,
            MPRIS_PATH,
            (proxy, err) => {
                if (this._destroyed || err || !proxy)
                    return;
                this._rootProxy = proxy;
                this._syncRootMeta();
                this._rootSigId = proxy.connect('g-properties-changed', () => {
                    this._syncRootMeta();
                    this._onChanged();
                });
                this._onChanged();
            }
        );

        new MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            MPRIS_PATH,
            (proxy, err) => {
                if (this._destroyed || err || !proxy)
                    return;
                this._playerProxy = proxy;
                this._syncPlayerState();
                this._playerSigId = proxy.connect('g-properties-changed', () => {
                    this._syncPlayerState();
                    this._onChanged();
                });
                this._onChanged();
            }
        );
    }

    _syncRootMeta() {
        if (!this._rootProxy)
            return;
        if (this._rootProxy.Identity)
            this.identity = this._rootProxy.Identity;
    }

    _syncPlayerState() {
        const p = this._playerProxy;
        if (!p)
            return;

        this.status = p.PlaybackStatus || 'Stopped';
        this.canPlay = p.CanPlay ?? true;
        this.canGoNext = p.CanGoNext ?? true;
        this.canGoPrev = p.CanGoPrevious ?? true;

        const meta = {};
        if (p.Metadata) {
            for (const k of Object.keys(p.Metadata)) {
                try {
                    meta[k] = p.Metadata[k].deepUnpack();
                } catch (_e) {
                    // Ignore malformed metadata variant.
                }
            }
        }

        this.title = typeof meta['xesam:title'] === 'string' ? meta['xesam:title'] : '';
        const rawArtist = meta['xesam:artist'];
        if (Array.isArray(rawArtist))
            this.artist = rawArtist.filter(a => typeof a === 'string').join(', ');
        else if (typeof rawArtist === 'string')
            this.artist = rawArtist;
        else
            this.artist = '';

        this.album = typeof meta['xesam:album'] === 'string' ? meta['xesam:album'] : '';
        this.artUrl = typeof meta['mpris:artUrl'] === 'string' ? meta['mpris:artUrl'] : '';
        this.lengthUs = Number(meta['mpris:length'] ?? 0);
        if (typeof p.Position === 'number')
            this.positionUs = p.Position;
    }

    refreshPositionAsync(cb) {
        if (this._destroyed)
            return;
        Gio.DBus.session.call(
            this.busName,
            MPRIS_PATH,
            'org.freedesktop.DBus.Properties',
            'Get',
            new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', 'Position']),
            new GLib.VariantType('(v)'),
            Gio.DBusCallFlags.NONE,
            1000,
            null,
            (_conn, res) => {
                if (this._destroyed)
                    return;
                try {
                    const out = Gio.DBus.session.call_finish(res);
                    const [inner] = out.deepUnpack();
                    this.positionUs = Number(inner.deepUnpack ? inner.deepUnpack() : inner) || 0;
                    cb();
                } catch (_e) {
                    // Some players do not support Position property reads.
                }
            }
        );
    }

    playPause() {
        this._playerProxy?.PlayPauseAsync().catch(() => {});
    }

    next() {
        this._playerProxy?.NextAsync().catch(() => {});
    }

    previous() {
        this._playerProxy?.PreviousAsync().catch(() => {});
    }

    raise() {
        if (this._rootProxy?.DesktopEntry) {
            const app = Shell.AppSystem.get_default()?.lookup_app(
                `${this._rootProxy.DesktopEntry}.desktop`
            );
            if (app) {
                app.activate();
                return;
            }
        }
        if (this._rootProxy?.CanRaise)
            this._rootProxy.RaiseAsync().catch(() => {});
    }

    destroy() {
        this._destroyed = true;
        if (this._playerProxy && this._playerSigId) {
            this._playerProxy.disconnect(this._playerSigId);
            this._playerSigId = 0;
        }
        if (this._rootProxy && this._rootSigId) {
            this._rootProxy.disconnect(this._rootSigId);
            this._rootSigId = 0;
        }
        this._playerProxy = null;
        this._rootProxy = null;
    }
}

/**
 * Top-bar cyberpunk MPRIS music capsule + dropdown cover card.
 */
const HackerMusicIndicator = GObject.registerClass(
class HackerMusicIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'Hacker Music HUD');
        this._settings = settings;
        this._clients = new Map();
        this._preferredBus = null;
        this._currentArtUrl = '';
        this._soupSession = new Soup.Session({timeout: 5});
        this._artCancellable = null;
        this._posTimerId = 0;
        this._nameOwnerSubId = 0;

        this._buildTopBarPill();
        this._buildPopupCard();
        this._subscribeDbus();

        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._startPositionPolling();
            else
                this._stopPositionPolling();
        });

        this._settingsSigId = this._settings.connect('changed', () => this._refreshUi());
        this.connect('destroy', () => this._cleanup());
    }

    _buildTopBarPill() {
        this._pill = new St.BoxLayout({
            style_class: 'hacker-music-pill hacker-music-pill-idle',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._spectrum = new SpectrumBars();
        this._pill.add_child(this._spectrum);

        this._topLabel = new St.Label({
            text: 'Sem mídia',
            style_class: 'hacker-music-label hacker-music-label-idle',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._topLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._pill.add_child(this._topLabel);

        this._controlsBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._prevBtn = this._makeIconBtn(
            'media-skip-backward-symbolic',
            13,
            () => this._getActiveClient()?.previous(),
            'hacker-music-btn'
        );
        this._playBtn = this._makeIconBtn(
            'media-playback-start-symbolic',
            13,
            () => this._getActiveClient()?.playPause(),
            'hacker-music-btn hacker-music-btn-play'
        );
        this._nextBtn = this._makeIconBtn(
            'media-skip-forward-symbolic',
            13,
            () => this._getActiveClient()?.next(),
            'hacker-music-btn'
        );

        this._controlsBox.add_child(this._prevBtn);
        this._controlsBox.add_child(this._playBtn);
        this._controlsBox.add_child(this._nextBtn);
        this._pill.add_child(this._controlsBox);

        this.add_child(this._pill);
    }

    _makeIconBtn(iconName, iconSize, onClick, styleClass, extraStyle = '') {
        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: iconSize,
        });
        const btn = new St.Button({
            child: icon,
            style_class: styleClass,
            style: extraStyle,
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        btn._icon = icon;
        btn.connect('clicked', () => {
            onClick();
            return Clutter.EVENT_STOP;
        });
        return btn;
    }

    vfunc_event(event) {
        const src = event.get_source();
        if (src && this._controlsBox?.contains(src))
            return Clutter.EVENT_PROPAGATE;
        return super.vfunc_event(event);
    }

    _buildPopupCard() {
        this.menu.actor.add_style_class_name('hacker-music-menu');

        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'hacker-music-menu-item',
        });
        item.setOrnament(PopupMenu.Ornament.NONE);

        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'hacker-music-card',
        });

        // Header row: status tag + clickable player switch/focus badge
        const headerRow = new St.BoxLayout({x_expand: true});
        this._cardHeader = new St.Label({
            text: 'Em espera',
            style_class: 'hacker-music-card-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._sourceBtn = new St.Button({
            label: 'Inativo',
            style_class: 'hacker-music-source-btn',
            reactive: true,
        });
        this._sourceBtn.connect('clicked', () => {
            const keys = Array.from(this._clients.keys());
            if (keys.length > 1) {
                const idx = keys.indexOf(this._preferredBus);
                this._preferredBus = keys[(idx + 1) % keys.length];
                this._refreshUi();
            } else {
                this._getActiveClient()?.raise();
            }
        });
        headerRow.add_child(this._cardHeader);
        headerRow.add_child(this._sourceBtn);
        card.add_child(headerRow);

        // Middle row: cover art + track details
        const bodyRow = new St.BoxLayout({x_expand: true});
        this._artIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 32,
        });
        const artBox = new St.Bin({
            style_class: 'hacker-music-art-box',
            child: this._artIcon,
            y_align: Clutter.ActorAlign.CENTER,
        });
        bodyRow.add_child(artBox);

        const infoCol = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 12px;',
        });
        this._titleLabel = new St.Label({
            text: 'Nenhuma mídia em reprodução',
            style_class: 'hacker-music-title',
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artistLabel = new St.Label({
            text: 'Abra Spotify, YouTube ou VLC',
            style_class: 'hacker-music-artist',
        });
        this._artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._albumLabel = new St.Label({
            text: '',
            style_class: 'hacker-music-album',
        });
        this._albumLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        infoCol.add_child(this._titleLabel);
        infoCol.add_child(this._artistLabel);
        infoCol.add_child(this._albumLabel);
        bodyRow.add_child(infoCol);
        card.add_child(bodyRow);

        // Progress bar + time row
        const trackWrap = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'margin-top: 12px;',
        });
        this._progressTrack = new St.Widget({
            style_class: 'hacker-music-progress-track',
            x_expand: true,
            height: 4,
            layout_manager: new Clutter.BinLayout(),
        });
        this._progressFill = new St.Widget({
            style_class: 'hacker-music-progress-fill',
            width: 0,
            height: 4,
            x_align: Clutter.ActorAlign.START,
            y_expand: true,
        });
        this._progressTrack.add_child(this._progressFill);
        trackWrap.add_child(this._progressTrack);

        const timeRow = new St.BoxLayout({x_expand: true});
        this._posLabel = new St.Label({text: '00:00', style_class: 'hacker-music-time', x_expand: true});
        this._lenLabel = new St.Label({text: '00:00', style_class: 'hacker-music-time'});
        timeRow.add_child(this._posLabel);
        timeRow.add_child(this._lenLabel);
        trackWrap.add_child(timeRow);
        card.add_child(trackWrap);

        // Tactile glass controls row
        const ctrlRow = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            style: 'margin-top: 10px;',
        });
        this._cardPrev = this._makeIconBtn(
            'media-skip-backward-symbolic',
            16,
            () => this._getActiveClient()?.previous(),
            'hacker-music-ctrl-btn',
            'margin-right: 10px;'
        );
        this._cardPlay = this._makeIconBtn(
            'media-playback-start-symbolic',
            18,
            () => this._getActiveClient()?.playPause(),
            'hacker-music-ctrl-btn hacker-music-ctrl-btn-main',
            'margin-right: 10px;'
        );
        this._cardNext = this._makeIconBtn(
            'media-skip-forward-symbolic',
            16,
            () => this._getActiveClient()?.next(),
            'hacker-music-ctrl-btn'
        );

        ctrlRow.add_child(this._cardPrev);
        ctrlRow.add_child(this._cardPlay);
        ctrlRow.add_child(this._cardNext);
        card.add_child(ctrlRow);

        item.add_child(card);
        this.menu.addMenuItem(item);
    }

    _subscribeDbus() {
        this._nameOwnerSubId = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus',
            'org.freedesktop.DBus',
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                const [name, oldOwner, newOwner] = params.deepUnpack();
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (newOwner && !oldOwner)
                    this._addBusName(name);
                else if (!newOwner && oldOwner)
                    this._removeBusName(name);
            }
        );

        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            2000,
            null,
            (_conn, res) => {
                try {
                    const [names] = Gio.DBus.session.call_finish(res).deepUnpack();
                    for (const n of names) {
                        if (n.startsWith(MPRIS_PREFIX))
                            this._addBusName(n);
                    }
                    this._refreshUi();
                } catch (_e) {
                    this._refreshUi();
                }
            }
        );
    }

    _addBusName(name) {
        if (this._clients.has(name))
            return;
        const client = new MprisClient(name, () => this._refreshUi());
        this._clients.set(name, client);
        if (!this._preferredBus)
            this._preferredBus = name;
        this._refreshUi();
    }

    _removeBusName(name) {
        const client = this._clients.get(name);
        if (!client)
            return;
        client.destroy();
        this._clients.delete(name);
        if (this._preferredBus === name)
            this._preferredBus = this._clients.keys().next().value ?? null;
        this._refreshUi();
    }

    _getActiveClient() {
        if (this._clients.size === 0)
            return null;
        // Prefer whichever player is currently Playing.
        const preferred = this._preferredBus ? this._clients.get(this._preferredBus) : null;
        if (preferred && preferred.status === 'Playing')
            return preferred;
        for (const c of this._clients.values()) {
            if (c.status === 'Playing')
                return c;
        }
        return preferred ?? this._clients.values().next().value ?? null;
    }

    _refreshUi() {
        const client = this._getActiveClient();
        const showIdle = this._settings.get_boolean('show-when-idle');
        const maxWidth = Math.max(100, this._settings.get_int('max-label-width'));
        this._topLabel.style = `max-width: ${maxWidth}px;`;

        if (!client) {
            this.visible = showIdle;
            this._pill.style_class = 'hacker-music-pill hacker-music-pill-idle';
            this._topLabel.style_class = 'hacker-music-label hacker-music-label-idle';
            this._topLabel.text = 'Sem mídia';
            this._controlsBox.visible = false;
            this._spectrum.setState(false, false);

            this._cardHeader.text = 'Em espera';
            this._sourceBtn.label = 'Inativo';
            this._titleLabel.text = 'Nenhuma mídia em reprodução';
            this._artistLabel.text = 'Toque algo no navegador ou Spotify';
            this._albumLabel.text = '';
            this._cardPlay._icon.icon_name = 'media-playback-start-symbolic';
            this._updateAlbumArt('');
            this._updateProgressBar(0, 0);
            return;
        }

        this.visible = true;
        const isPlaying = client.status === 'Playing';
        const playIcon = isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._controlsBox.visible = true;
        this._spectrum.setState(true, isPlaying);

        this._pill.style_class = isPlaying
            ? 'hacker-music-pill hacker-music-pill-playing'
            : 'hacker-music-pill';
        this._topLabel.style_class = 'hacker-music-label';

        const trackText = client.artist && client.title
            ? `${client.title} — ${client.artist}`
            : (client.title || client.identity || 'Mídia');
        this._topLabel.text = trackText;
        this._playBtn._icon.icon_name = playIcon;
        this._prevBtn.opacity = client.canGoPrev ? 255 : 90;
        this._nextBtn.opacity = client.canGoNext ? 255 : 90;

        this._cardHeader.text = isPlaying ? 'Reproduzindo agora' : 'Pausado';
        const extraPlayers = this._clients.size > 1 ? ` · ${this._clients.size}` : '';
        this._sourceBtn.label = `${client.identity}${extraPlayers}`;

        this._titleLabel.text = client.title || 'Faixa desconhecida';
        this._artistLabel.text = client.artist || client.identity;
        this._albumLabel.text = client.album || '';
        this._cardPlay._icon.icon_name = playIcon;
        this._cardPrev.opacity = client.canGoPrev ? 255 : 90;
        this._cardNext.opacity = client.canGoNext ? 255 : 90;

        this._updateAlbumArt(client.artUrl);
        this._updateProgressBar(client.positionUs, client.lengthUs);
    }

    _updateProgressBar(posUs, lenUs) {
        this._posLabel.text = formatMicros(posUs);
        this._lenLabel.text = formatMicros(lenUs);
        const trackW = Math.max(250, this._progressTrack.width || 278);
        const ratio = lenUs > 0 ? Math.min(1.0, Math.max(0.0, posUs / lenUs)) : 0.0;
        this._progressFill.width = Math.round(trackW * ratio);
    }

    _setArtFile(file) {
        this._artIcon.icon_name = null;
        this._artIcon.gicon = new Gio.FileIcon({file});
        this._artIcon.icon_size = 68;
    }

    _updateAlbumArt(artUrl) {
        if (artUrl === this._currentArtUrl)
            return;
        this._currentArtUrl = artUrl;

        if (this._artCancellable) {
            this._artCancellable.cancel();
            this._artCancellable = null;
        }

        if (!artUrl) {
            this._artIcon.gicon = null;
            this._artIcon.icon_name = 'audio-x-generic-symbolic';
            this._artIcon.icon_size = 32;
            return;
        }

        if (artUrl.startsWith('file://')) {
            this._setArtFile(Gio.File.new_for_uri(artUrl));
            return;
        }

        if (artUrl.startsWith('http://') || artUrl.startsWith('https://')) {
            const cachePath = `${GLib.get_tmp_dir()}/hacker-music-art-${hashString(artUrl)}`;
            const cacheFile = Gio.File.new_for_path(cachePath);
            if (cacheFile.query_exists(null)) {
                this._setArtFile(cacheFile);
                return;
            }

            const cancellable = new Gio.Cancellable();
            this._artCancellable = cancellable;
            const msg = Soup.Message.new('GET', artUrl);
            if (!msg)
                return;

            this._soupSession.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                (_sess, res) => {
                    try {
                        const bytes = this._soupSession.send_and_read_finish(res);
                        if (this._currentArtUrl !== artUrl || msg.status_code !== 200 || !bytes)
                            return;
                        GLib.file_set_contents(cachePath, bytes.toArray());
                        this._setArtFile(Gio.File.new_for_path(cachePath));
                    } catch (_e) {
                        // Keep fallback audio glyph when offline/cancelled.
                    }
                }
            );
        }
    }

    _startPositionPolling() {
        this._stopPositionPolling();
        const tick = () => {
            const client = this._getActiveClient();
            if (client) {
                client.refreshPositionAsync(() => {
                    if (this._getActiveClient() === client)
                        this._updateProgressBar(client.positionUs, client.lengthUs);
                });
            }
        };
        tick();
        this._posTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPositionPolling() {
        if (this._posTimerId) {
            GLib.source_remove(this._posTimerId);
            this._posTimerId = 0;
        }
    }

    _cleanup() {
        this._stopPositionPolling();
        if (this._settingsSigId && this._settings) {
            this._settings.disconnect(this._settingsSigId);
            this._settingsSigId = 0;
        }
        if (this._nameOwnerSubId) {
            Gio.DBus.session.signal_unsubscribe(this._nameOwnerSubId);
            this._nameOwnerSubId = 0;
        }
        if (this._artCancellable) {
            this._artCancellable.cancel();
            this._artCancellable = null;
        }
        if (this._soupSession) {
            this._soupSession.abort();
            this._soupSession = null;
        }
        for (const c of this._clients.values())
            c.destroy();
        this._clients.clear();
    }
});

export default class HackerMusicExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = null;
        this._placementChangedId = this._settings.connect('changed::panel-box', () => this._mount());
        this._indexChangedId = this._settings.connect('changed::panel-index', () => this._mount());
        this._mount();
    }

    _mount() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        const box = this._settings.get_string('panel-box') || 'center';
        const validBox = ['left', 'center', 'right'].includes(box) ? box : 'center';
        const index = this._settings.get_int('panel-index');
        this._indicator = new HackerMusicIndicator(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, validBox);
    }

    disable() {
        if (this._placementChangedId && this._settings) {
            this._settings.disconnect(this._placementChangedId);
            this._placementChangedId = 0;
        }
        if (this._indexChangedId && this._settings) {
            this._settings.disconnect(this._indexChangedId);
            this._indexChangedId = 0;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}
