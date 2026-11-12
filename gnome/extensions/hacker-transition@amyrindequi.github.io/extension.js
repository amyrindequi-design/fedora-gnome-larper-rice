import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WorkspaceAnimationController} from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SHADER_NAME = 'hacker-glitch-shader';

const SHADER_DECLARATIONS = `
uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;
uniform float uDirection;
uniform vec2  uSize;
uniform vec3  uPrimary;
uniform vec3  uSecondary;
uniform vec3  uAlert;

float hHash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hHash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec4 hSampleStraight(vec2 uv) {
    vec2 safeUV = clamp(uv, vec2(0.001), vec2(0.999));
    vec4 c = texture2D(uTexture, safeUV);
    if (c.a > 0.0001) {
        c.rgb /= c.a;
    }
    return c;
}
`;

const SHADER_MAIN = `
vec2 uv = cogl_tex_coord_in[0].xy;
vec4 base = hSampleStraight(uv);

float intensity = clamp(uIntensity, 0.0, 1.5);
vec4 finalColor = vec4(base.rgb, base.a * cogl_color_in.a);

if (intensity > 0.005) {
    float alphaMask = smoothstep(0.15, 0.75, base.a);
    float t = floor(uTime * 22.0);
    float bandFine = floor(uv.y * 32.0);
    float bandCoarse = floor(uv.y * 9.0);

    float triggerFine = step(0.68 - 0.30 * min(intensity, 1.0), hHash21(vec2(bandFine, t)));
    float triggerCoarse = step(0.84 - 0.22 * min(intensity, 1.0), hHash21(vec2(bandCoarse, floor(uTime * 11.0))));

    float tearFine = (hHash21(vec2(bandFine + 17.0, t)) - 0.5) * 0.055 * triggerFine * intensity;
    float tearCoarse = (hHash21(vec2(bandCoarse + 5.0, floor(uTime * 9.0))) - 0.5) * 0.11 * triggerCoarse * intensity;
    float tearOffset = (tearFine + tearCoarse) * alphaMask * uDirection;

    vec2 displacedUV = vec2(uv.x + tearOffset, uv.y);

    // Chromatic RGB desync split during peak transitions.
    float rgbSplit = (0.0045 + 0.014 * triggerFine + 0.010 * triggerCoarse) * intensity * alphaMask;
    vec4 colCenter = hSampleStraight(displacedUV);
    vec4 colR = hSampleStraight(displacedUV + vec2(rgbSplit, 0.0));
    vec4 colB = hSampleStraight(displacedUV - vec2(rgbSplit, 0.0));

    vec3 color = vec3(colR.r, colCenter.g, colB.b);

    // Highlight packet-corruption bands with alert crimson / Chrollo purple tints.
    if (triggerCoarse > 0.5) {
        float mode = hHash21(vec2(bandCoarse, t * 0.5));
        vec3 tint = mode > 0.55 ? uSecondary : uAlert;
        color = mix(color, color * 0.65 + tint * 0.45, 0.42 * intensity * alphaMask);
    }

    // Matrix digital rain columns + pixel grid.
    vec2 px = uv * uSize;
    float colId = floor(px.x / 12.0);
    float cellY = floor(px.y / 14.0);
    float speed = 9.0 + hHash11(colId * 3.7) * 14.0;
    float head = fract((px.y / max(uSize.y, 1.0)) - uTime * (speed * 0.065) - hHash11(colId * 11.3));
    float glyphNoise = step(0.32, hHash21(vec2(colId, cellY + floor(uTime * 10.0))));
    float rainTrail = smoothstep(0.62, 1.0, head) * glyphNoise;
    float rainHead = smoothstep(0.96, 1.0, head) * glyphNoise;

    vec3 rainColor = uPrimary * (rainTrail * 0.38 + rainHead * 0.85);
    color += rainColor * intensity * alphaMask;

    // Rolling cyber laser scanner beam across the viewport.
    float scanPos = fract(uTime * 0.85 * sign(uDirection + 0.01));
    float distScan = abs(uv.x - scanPos);
    float scanLine = exp(-distScan * 48.0) * 0.55 + exp(-distScan * 220.0) * 0.90;
    vec3 scanTint = mix(uPrimary, uSecondary, 0.45 + 0.45 * sin(uv.y * 8.0 + uTime * 6.0));
    color += scanTint * scanLine * 0.45 * intensity * alphaMask;

    // Subtle CRT scanlines.
    float crt = 0.92 + 0.08 * sin(px.y * 1.45);
    color *= mix(1.0, crt, 0.75 * min(intensity, 1.0) * alphaMask);

    // Vignette cyber tint along edges during switch.
    vec2 edge = abs(uv - 0.5) * 2.0;
    float edgeGlow = pow(max(edge.x, edge.y), 3.0) * 0.35 * intensity * alphaMask;
    color = mix(color, mix(color, uSecondary * 0.85 + uPrimary * 0.35, 0.5), edgeGlow);

    finalColor = vec4(clamp(color, 0.0, 1.0), colCenter.a * cogl_color_in.a);
}

cogl_color_out = finalColor;
`;

/**
 * Parses a `#rrggbb` hex color into normalized `[r, g, b]` floats.
 */
function parseHexColor(hex, fallback) {
    if (typeof hex !== 'string')
        return fallback;
    const clean = hex.trim().replace('#', '');
    if (clean.length !== 6)
        return fallback;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
        return fallback;
    return [r / 255.0, g / 255.0, b / 255.0];
}

/**
 * GPU shader effect applying cyber slice tear, RGB split, Matrix rain,
 * rolling laser sweep, and CRT scanlines to transitioning actors.
 */
const HackerGlitchShader = GObject.registerClass(
class HackerGlitchShader extends Clutter.ShaderEffect {
    _init(colors) {
        super._init();
        this._time = 0.0;
        this._intensity = 0.0;
        this._direction = 1.0;
        this._width = 1920.0;
        this._height = 1080.0;
        this._primary = colors.primary;
        this._secondary = colors.secondary;
        this._alert = colors.alert;
        this.enabled = false;
    }

    updateParams(time, intensity, direction, width, height, colors) {
        this._time = time;
        this._intensity = intensity;
        this._direction = direction >= 0 ? 1.0 : -1.0;
        this._width = Math.max(1.0, width);
        this._height = Math.max(1.0, height);
        this._primary = colors.primary;
        this._secondary = colors.secondary;
        this._alert = colors.alert;

        const active = intensity > 0.005;
        if (this.enabled !== active)
            this.enabled = active;
        if (active)
            this.queue_repaint();
    }

    vfunc_get_static_snippet() {
        const snippet = Cogl.Snippet.new(
            Cogl.SnippetHook.FRAGMENT,
            SHADER_DECLARATIONS,
            null
        );
        snippet.set_replace(SHADER_MAIN);
        return snippet;
    }

    vfunc_paint_target(...params) {
        const pipeline = this.get_pipeline();
        if (pipeline) {
            pipeline.set_blend(
                'RGBA = ADD (SRC_COLOR * (SRC_COLOR[A]), DST_COLOR * (1-SRC_COLOR[A]))'
            );
            const texLoc = pipeline.get_uniform_location('uTexture');
            if (texLoc >= 0)
                pipeline.set_uniform_1i(texLoc, 0);
        }

        this.set_uniform_float('uTime', 1, [this._time]);
        this.set_uniform_float('uIntensity', 1, [this._intensity]);
        this.set_uniform_float('uDirection', 1, [this._direction]);
        this.set_uniform_float('uSize', 2, [this._width, this._height]);
        this.set_uniform_float('uPrimary', 3, this._primary.slice(0, 3));
        this.set_uniform_float('uSecondary', 3, this._secondary.slice(0, 3));
        this.set_uniform_float('uAlert', 3, this._alert.slice(0, 3));

        super.vfunc_paint_target(...params);
    }
});

/**
 * 60fps Cairo tactical HUD overlay drawn above transitioning monitors.
 */
const HackerHudOverlay = GObject.registerClass(
class HackerHudOverlay extends St.DrawingArea {
    _init(monitor, colors) {
        super._init({
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            reactive: false,
            can_focus: false,
        });
        this._colors = colors;
        this._intensity = 0.0;
        this._time = 0.0;
        this._progress = 0.0;
        this._fromWs = 0;
        this._toWs = 0;
        this._totalWs = 4;

        this.connect('repaint', this._onRepaint.bind(this));
    }

    updateState(state) {
        this._intensity = state.intensity;
        this._time = state.time;
        this._progress = state.progress;
        this._fromWs = state.fromWs;
        this._toWs = state.toWs;
        this._totalWs = state.totalWs;
        this._colors = state.colors;
        this.queue_repaint();
    }

    _drawCornerBracket(cr, x, y, dx, dy, len) {
        cr.moveTo(x, y + dy * len);
        cr.lineTo(x, y);
        cr.lineTo(x + dx * len, y);
        cr.stroke();
    }

    _onRepaint() {
        const cr = this.get_context();
        try {
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);

            const alpha = Math.min(1.0, this._intensity * 1.15);
            if (alpha <= 0.01)
                return;

            const [w, h] = this.get_surface_size();
            const [pr, pg, pb] = this._colors.primary;
            const [sr, sg, sb] = this._colors.secondary;
            const [ar, ag, ab] = this._colors.alert;

            // Corner cyber reticle brackets.
            const pad = 26;
            const arm = 34;
            cr.setLineWidth(2.0);
            cr.setSourceRGBA(pr, pg, pb, 0.72 * alpha);
            this._drawCornerBracket(cr, pad, pad, 1, 1, arm);
            this._drawCornerBracket(cr, w - pad, pad, -1, 1, arm);
            this._drawCornerBracket(cr, pad, h - pad, 1, -1, arm);
            this._drawCornerBracket(cr, w - pad, h - pad, -1, -1, arm);

            // Top-center node jump telemetry pill.
            const pillW = Math.min(460, w * 0.48);
            const pillH = 44;
            const pillX = (w - pillW) * 0.5;
            const pillY = 30;

            cr.setSourceRGBA(0.03, 0.05, 0.08, 0.74 * alpha);
            cr.rectangle(pillX, pillY, pillW, pillH);
            cr.fill();

            cr.setLineWidth(1.4);
            cr.setSourceRGBA(sr, sg, sb, 0.85 * alpha);
            cr.rectangle(pillX, pillY, pillW, pillH);
            cr.stroke();

            const pct = Math.round(Math.min(100, Math.max(0, this._getNormalizedProgress() * 100)));
            const fromLabel = String(this._fromWs + 1).padStart(2, '0');
            const toLabel = String(this._toWs + 1).padStart(2, '0');
            const header = `SYS://CUBE_BUS  NODE_${fromLabel} >> NODE_${toLabel}  [${String(pct).padStart(3, '0')}%]`;

            cr.selectFontFace('JetBrainsMono Nerd Font', 0, 1);
            cr.setFontSize(12.5);
            cr.setSourceRGBA(pr, pg, pb, 0.95 * alpha);
            cr.moveTo(pillX + 14, pillY + 20);
            cr.showText(header);

            // Progress scan bar inside pill.
            const barX = pillX + 14;
            const barY = pillY + 30;
            const barW = pillW - 28;
            cr.setSourceRGBA(0.15, 0.18, 0.25, 0.9 * alpha);
            cr.rectangle(barX, barY, barW, 5);
            cr.fill();

            const fillW = barW * Math.min(1.0, Math.max(0.05, this._getNormalizedProgress()));
            cr.setSourceRGBA(pr, pg, pb, 0.9 * alpha);
            cr.rectangle(barX, barY, fillW * 0.65, 5);
            cr.fill();
            cr.setSourceRGBA(sr, sg, sb, 0.9 * alpha);
            cr.rectangle(barX + fillW * 0.65, barY, fillW * 0.35, 5);
            cr.fill();

            // Top-left live hex telemetry stream.
            cr.setFontSize(11);
            const tick = Math.floor(this._time * 18);
            const lines = [
                `0x${((tick * 7919 + 0xA855) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}  GLSL_PIPELINE   ACTIVE`,
                `0x${((tick * 6133 + 0x00FF) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}  SKYBOX_ROT      ${this._progress.toFixed(2)}`,
                `0x${((tick * 3571 + 0xEF44) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}  PKT_INTEGRITY   ENCRYPTED`,
            ];
            for (let i = 0; i < lines.length; i++) {
                cr.setSourceRGBA(i === 2 ? ar : pr, i === 2 ? ag : pg, i === 2 ? ab : pb, (0.78 - i * 0.12) * alpha);
                cr.moveTo(pad + 14, pad + 26 + i * 16);
                cr.showText(lines[i]);
            }

            // Bottom workspace slots + micro oscilloscope waveform.
            const slotsCount = Math.max(1, Math.min(9, this._totalWs));
            const slotW = 34;
            const slotGap = 8;
            const slotsTotalW = slotsCount * slotW + (slotsCount - 1) * slotGap;
            const baseW = Math.max(slotsTotalW + 120, 280);
            const baseX = (w - baseW) * 0.5;
            const baseY = h - 72;

            cr.setSourceRGBA(0.03, 0.05, 0.08, 0.72 * alpha);
            cr.rectangle(baseX, baseY, baseW, 40);
            cr.fill();

            const startSlotX = (w - slotsTotalW) * 0.5;
            const activeRound = Math.round(this._progress);
            for (let i = 0; i < slotsCount; i++) {
                const sx = startSlotX + i * (slotW + slotGap);
                const sy = baseY + 9;
                const isTarget = i === this._toWs || i === activeRound;
                if (isTarget) {
                    cr.setSourceRGBA(pr, pg, pb, 0.28 * alpha);
                    cr.rectangle(sx, sy, slotW, 22);
                    cr.fill();
                    cr.setSourceRGBA(pr, pg, pb, 0.95 * alpha);
                } else {
                    cr.setSourceRGBA(sr, sg, sb, 0.45 * alpha);
                }
                cr.setLineWidth(isTarget ? 1.6 : 1.0);
                cr.rectangle(sx, sy, slotW, 22);
                cr.stroke();

                cr.setFontSize(11);
                cr.moveTo(sx + 9, sy + 15);
                cr.showText(`0${i + 1}`);
            }

            // Side mini signal waveforms inside bottom panel.
            cr.setLineWidth(1.3);
            cr.setSourceRGBA(sr, sg, sb, 0.85 * alpha);
            for (let side = 0; side < 2; side++) {
                const wx0 = side === 0 ? baseX + 10 : baseX + baseW - 44;
                cr.moveTo(wx0, baseY + 20);
                for (let x = 0; x <= 34; x += 3) {
                    const yOff = Math.sin(x * 0.45 + this._time * 18.0 + side * 2.0) * 8.0 * this._intensity;
                    cr.lineTo(wx0 + x, baseY + 20 + yOff);
                }
                cr.stroke();
            }
        } finally {
            cr.$dispose();
        }
    }

    _getNormalizedProgress() {
        const span = Math.abs(this._toWs - this._fromWs);
        if (span > 0.001)
            return Math.min(1.0, Math.max(0.0, Math.abs(this._progress - this._fromWs) / span));
        return Math.min(1.0, Math.abs(this._progress - Math.round(this._progress)) * 2.0);
    }
});

export default class HackerTransitionExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._refreshConfig();
        this._settingsChangedId = this._settings.connect('changed', () => this._refreshConfig());

        this._origAnimateSwitch = WorkspaceAnimationController.prototype.animateSwitch;
        this._origPrepareSwitch = WorkspaceAnimationController.prototype._prepareWorkspaceSwitch;
        this._origFinishSwitch = WorkspaceAnimationController.prototype._finishWorkspaceSwitch;

        this._activeSession = null;
        this._pendingMeta = null;

        const ext = this;

        WorkspaceAnimationController.prototype.animateSwitch = function (from, to, direction, onComplete) {
            ext._pendingMeta = {
                from,
                to,
                direction: to >= from ? 1.0 : -1.0,
            };
            return ext._origAnimateSwitch.call(this, from, to, direction, onComplete);
        };

        WorkspaceAnimationController.prototype._prepareWorkspaceSwitch = function (...args) {
            ext._origPrepareSwitch.apply(this, args);
            ext._onSwitchPrepared(this);
        };

        WorkspaceAnimationController.prototype._finishWorkspaceSwitch = function (...args) {
            ext._cleanupSession();
            ext._origFinishSwitch.apply(this, args);
        };
    }

    disable() {
        this._cleanupSession();

        if (this._origAnimateSwitch) {
            WorkspaceAnimationController.prototype.animateSwitch = this._origAnimateSwitch;
            this._origAnimateSwitch = null;
        }
        if (this._origPrepareSwitch) {
            WorkspaceAnimationController.prototype._prepareWorkspaceSwitch = this._origPrepareSwitch;
            this._origPrepareSwitch = null;
        }
        if (this._origFinishSwitch) {
            WorkspaceAnimationController.prototype._finishWorkspaceSwitch = this._origFinishSwitch;
            this._origFinishSwitch = null;
        }
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._settings = null;
    }

    _refreshConfig() {
        this._config = {
            enableShader: this._settings.get_boolean('enable-shader'),
            glitchWindows: this._settings.get_boolean('glitch-windows'),
            enableHud: this._settings.get_boolean('enable-hud'),
            shaderIntensity: this._settings.get_double('shader-intensity'),
            colors: {
                primary: parseHexColor(this._settings.get_string('primary-color'), [0.0, 1.0, 0.53]),
                secondary: parseHexColor(this._settings.get_string('secondary-color'), [0.66, 0.33, 0.97]),
                alert: parseHexColor(this._settings.get_string('alert-color'), [0.94, 0.27, 0.27]),
            },
        };
    }

    _onSwitchPrepared(controller) {
        this._cleanupSession();

        const monitors = controller?._switchData?.monitors;
        if (!monitors || monitors.length === 0)
            return;

        const meta = this._pendingMeta;
        this._pendingMeta = null;

        const activeWs = global.workspace_manager.get_active_workspace_index();
        const totalWs = global.workspace_manager.n_workspaces;
        const startUs = GLib.get_monotonic_time();

        const session = {
            controller,
            fromWs: meta ? meta.from : activeWs,
            toWs: meta ? meta.to : activeWs,
            hasExplicitTarget: Boolean(meta),
            totalWs,
            direction: meta ? meta.direction : 1.0,
            lastProgress: activeWs,
            startUs,
            timerId: 0,
            monitorEntries: [],
        };

        for (const m of monitors) {
            const monitorRect = m._monitor ?? Main.layoutManager.primaryMonitor;
            const entry = {
                monitorGroup: m,
                monitorRect,
                effects: [],
                hud: null,
                progressSigId: 0,
                destroySigId: 0,
            };

            if (this._config.enableShader) {
                const wsGroups = m._workspaceGroups ?? [];
                for (const wsGroup of wsGroups) {
                    this._attachEffectToActor(wsGroup._background, monitorRect, entry.effects);
                    if (this._config.glitchWindows && wsGroup._windowRecords) {
                        for (const rec of wsGroup._windowRecords)
                            this._attachEffectToActor(rec.clone, monitorRect, entry.effects);
                    }
                }
            }

            if (this._config.enableHud) {
                const hud = new HackerHudOverlay(monitorRect, this._config.colors);
                Main.uiGroup.add_child(hud);
                Main.uiGroup.set_child_above_sibling(hud, null);
                entry.hud = hud;
            }

            entry.progressSigId = m.connect('notify::progress', () => {
                this._updateSessionVisuals(session);
            });
            entry.destroySigId = m.connect('destroy', () => {
                this._cleanupMonitorEntry(entry);
            });

            session.monitorEntries.push(entry);
        }

        this._activeSession = session;
        this._updateSessionVisuals(session);

        session.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (this._activeSession !== session)
                return GLib.SOURCE_REMOVE;
            this._updateSessionVisuals(session);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _attachEffectToActor(actor, monitorRect, bucket) {
        if (!actor)
            return;

        if (actor.get_effect(SHADER_NAME))
            actor.remove_effect_by_name(SHADER_NAME);

        const effect = new HackerGlitchShader(this._config.colors);
        actor.add_effect_with_name(SHADER_NAME, effect);

        const item = {
            actor,
            effect,
            width: actor.width > 1 ? actor.width : monitorRect.width,
            height: actor.height > 1 ? actor.height : monitorRect.height,
            destroyId: 0,
        };
        item.destroyId = actor.connect('destroy', () => {
            item.actor = null;
            item.effect = null;
        });
        bucket.push(item);
    }

    _updateSessionVisuals(session) {
        const primary = session.monitorEntries[0];
        if (!primary || !primary.monitorGroup)
            return;

        const progress = Number(primary.monitorGroup.progress ?? session.fromWs);
        if (Math.abs(progress - session.lastProgress) > 0.0005)
            session.direction = progress >= session.lastProgress ? 1.0 : -1.0;
        session.lastProgress = progress;

        if (!session.hasExplicitTarget) {
            const delta = progress - session.fromWs;
            if (Math.abs(delta) > 0.05) {
                const step = delta > 0 ? Math.ceil(progress) : Math.floor(progress);
                session.toWs = Math.max(0, Math.min(session.totalWs - 1, step));
            }
        }

        let curve = 0.0;
        const span = Math.abs(session.toWs - session.fromWs);
        if (session.hasExplicitTarget && span > 0.001) {
            const t = Math.min(1.0, Math.max(0.0, Math.abs(progress - session.fromWs) / span));
            curve = Math.sin(Math.PI * t);
        } else {
            const frac = Math.abs(progress - Math.floor(progress));
            curve = Math.sin(Math.PI * frac);
        }

        // Keep an idle floor pulse while an animation is mid-gesture so HUD doesn't flicker.
        const intensity = curve * this._config.shaderIntensity;
        const elapsedSec = (GLib.get_monotonic_time() - session.startUs) / 1000000.0;

        for (const entry of session.monitorEntries) {
            for (const item of entry.effects) {
                if (item.actor && item.effect) {
                    item.effect.updateParams(
                        elapsedSec,
                        intensity,
                        session.direction,
                        item.width,
                        item.height,
                        this._config.colors
                    );
                }
            }
            if (entry.hud) {
                entry.hud.updateState({
                    intensity: Math.min(1.0, intensity),
                    time: elapsedSec,
                    progress,
                    fromWs: session.fromWs,
                    toWs: session.toWs,
                    totalWs: session.totalWs,
                    colors: this._config.colors,
                });
            }
        }
    }

    _cleanupMonitorEntry(entry) {
        if (entry.progressSigId && entry.monitorGroup) {
            try {
                entry.monitorGroup.disconnect(entry.progressSigId);
            } catch (_e) {
                // Ignore if already destroyed.
            }
            entry.progressSigId = 0;
        }
        if (entry.destroySigId && entry.monitorGroup) {
            try {
                entry.monitorGroup.disconnect(entry.destroySigId);
            } catch (_e) {
                // Ignore if already destroyed.
            }
            entry.destroySigId = 0;
        }
        entry.monitorGroup = null;

        for (const item of entry.effects) {
            if (item.actor) {
                if (item.destroyId) {
                    try {
                        item.actor.disconnect(item.destroyId);
                    } catch (_e) {
                        // Ignore.
                    }
                    item.destroyId = 0;
                }
                try {
                    if (item.actor.get_effect(SHADER_NAME))
                        item.actor.remove_effect_by_name(SHADER_NAME);
                } catch (_e) {
                    // Actor may already be tearing down.
                }
                item.actor = null;
                item.effect = null;
            }
        }
        entry.effects.length = 0;

        if (entry.hud) {
            try {
                entry.hud.destroy();
            } catch (_e) {
                // Ignore if already destroyed.
            }
            entry.hud = null;
        }
    }

    _cleanupSession() {
        const session = this._activeSession;
        if (!session)
            return;
        this._activeSession = null;
        this._pendingMeta = null;

        if (session.timerId) {
            GLib.source_remove(session.timerId);
            session.timerId = 0;
        }
        for (const entry of session.monitorEntries)
            this._cleanupMonitorEntry(entry);
        session.monitorEntries.length = 0;
    }
}
