import {WorkspaceAnimationController} from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

export default class CardTransitionExtension extends Extension {
    enable() {
        this._origPrepareSwitch = WorkspaceAnimationController.prototype._prepareWorkspaceSwitch;
        this._origFinishSwitch = WorkspaceAnimationController.prototype._finishWorkspaceSwitch;
        this._activeSession = null;

        const ext = this;

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

        if (this._origPrepareSwitch) {
            WorkspaceAnimationController.prototype._prepareWorkspaceSwitch = this._origPrepareSwitch;
            this._origPrepareSwitch = null;
        }
        if (this._origFinishSwitch) {
            WorkspaceAnimationController.prototype._finishWorkspaceSwitch = this._origFinishSwitch;
            this._origFinishSwitch = null;
        }
    }

    _onSwitchPrepared(controller) {
        this._cleanupSession();

        const monitors = controller?._switchData?.monitors;
        if (!monitors || monitors.length === 0)
            return;

        const session = {
            controller,
            monitorEntries: [],
        };

        for (const m of monitors) {
            const wsGroups = m._workspaceGroups ?? [];
            for (const wsGroup of wsGroups) {
                wsGroup.set_pivot_point(0.5, 0.5);
                wsGroup.clip_to_allocation = true;
                const parent = wsGroup.get_parent();
                if (parent)
                    parent.set_child_above_sibling(wsGroup, null);
            }

            const entry = {
                monitorGroup: m,
                wsGroups,
                progressSigId: 0,
                destroySigId: 0,
            };

            entry.progressSigId = m.connect('notify::progress', () => {
                this._updateCards(session);
            });
            entry.destroySigId = m.connect('destroy', () => {
                this._cleanupMonitorEntry(entry);
            });

            session.monitorEntries.push(entry);
        }

        this._activeSession = session;
        this._updateCards(session);
    }

    _updateCards(session) {
        for (const entry of session.monitorEntries) {
            const m = entry.monitorGroup;
            if (!m)
                continue;

            const progress = Number(m.progress ?? 0);
            const width = m.width > 1 ? m.width : (m._monitor?.width ?? 1920);
            const groups = entry.wsGroups;

            for (let i = 0; i < groups.length; i++) {
                const wsGroup = groups[i];
                if (!wsGroup)
                    continue;

                const delta = i - progress;
                const absD = clamp(Math.abs(delta), 0.0, 1.0);

                if (delta < 0) {
                    // Card underneath: stays stacked behind while shrinking & tilting gently.
                    wsGroup.translation_x = absD * width * 0.72;
                    const s = 1.0 - 0.09 * absD;
                    wsGroup.set_scale(s, s);
                    wsGroup.rotation_angle_y = -4.0 * absD;
                    wsGroup.opacity = Math.round(255 * (1.0 - 0.38 * absD));
                } else {
                    // Incoming card: glides cleanly over the lower card without Z-fighting.
                    wsGroup.translation_x = -absD * width * 0.04;
                    const s = 0.96 + 0.04 * (1.0 - absD);
                    wsGroup.set_scale(s, s);
                    wsGroup.rotation_angle_y = 3.5 * absD;
                    wsGroup.opacity = Math.round(255 * (1.0 - 0.06 * absD));
                }
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

        for (const wsGroup of entry.wsGroups ?? []) {
            if (!wsGroup)
                continue;
            try {
                wsGroup.translation_x = 0;
                wsGroup.translation_z = 0;
                wsGroup.rotation_angle_y = 0;
                wsGroup.set_scale(1.0, 1.0);
                wsGroup.opacity = 255;
                wsGroup.clip_to_allocation = false;
            } catch (_e) {
                // Ignore if tearing down.
            }
        }

        entry.monitorGroup = null;
        entry.wsGroups = [];
    }

    _cleanupSession() {
        const session = this._activeSession;
        if (!session)
            return;
        this._activeSession = null;

        for (const entry of session.monitorEntries)
            this._cleanupMonitorEntry(entry);
        session.monitorEntries.length = 0;
    }
}
