from pathlib import Path
p=Path('ames/factory-engine/ames/tela_3022.py')
t=p.read_text(encoding='utf-8')
old=r'''    def _history_response(self, frame, grid_id, action):
        """One response lifecycle on the selected visible history store.

        Ext Store.load emits load; Ajax + loadData emits datachanged. Both are
        real dataset events, including identical rows, unlike a typed SN or a
        content hash. Listeners are removed on every exit, including timeout.
        """
        return frame.evaluate(r"""args => {
          const g = window.Ext && Ext.getCmp(args.id), s = g && g.getStore();
          if (!s) throw new Error('3022 history store unavailable');
          if (args.action === 'arm' || args.action === 'dispose') {
            const old = s.__ames3022Response;
            if (old) {
              s.un('datachanged', old.changed); s.un('load', old.loaded);
              delete s.__ames3022Response;
            }
          }
          if (args.action === 'arm') {
            const state = {changes:0, loads:0, success:null};
            state.changed = () => { state.changes += 1; };
            state.loaded = (_store, _records, success) => {
              state.loads += 1; state.success = success !== false;
            };
            s.on('datachanged', state.changed); s.on('load', state.loaded);
            s.__ames3022Response = state;
          }
          const st = s.__ames3022Response;
          return st ? {changes:st.changes, loads:st.loads, success:st.success} : null;
        }""", {"id": grid_id, "action": action})
'''
new=r'''    def _grid_store_token(self, frame, grid_id):
        """Stable runtime identity for the concrete ExtJS store bound to a grid."""
        return frame.evaluate(r"""id => {
          const g = window.Ext && Ext.getCmp(id), s = g && g.getStore && g.getStore();
          if (!s) return null;
          if (!s.__ames3022StoreToken) {
            const root = globalThis.__ames3022StoreTokens || (globalThis.__ames3022StoreTokens = {next: 1});
            const token = 'store-' + (root.next++);
            try { Object.defineProperty(s, '__ames3022StoreToken', {value: token, configurable: true}); }
            catch(e) { s.__ames3022StoreToken = token; }
          }
          return String(s.__ames3022StoreToken || '');
        }""", grid_id)

    def _history_response(self, frame, grid_id, action, token):
        """Observe one submitted query without assuming grid/store identity survives View."""
        return frame.evaluate(r"""args => {
          if (!window.Ext) throw new Error('3022 ExtJS unavailable');
          const root = globalThis.__ames3022Responses || (globalThis.__ames3022Responses = {});
          const dispose = st => {
            if (!st || !st.store) return;
            try { st.store.un('datachanged', st.changed); } catch(e) {}
            try { st.store.un('load', st.loaded); } catch(e) {}
          };
          if (args.action === 'dispose') {
            const st = root[args.token]; dispose(st); delete root[args.token]; return null;
          }
          if (args.action === 'arm') {
            const prior = root[args.token]; dispose(prior); delete root[args.token];
            const g = Ext.getCmp(args.id), s = g && g.getStore && g.getStore();
            if (!s) throw new Error('3022 history store unavailable');
            const state = {store:s, grid_id:args.id, changes:0, loads:0, success:null};
            state.changed = () => { state.changes += 1; };
            state.loaded = (_store, _records, success) => {
              state.loads += 1; state.success = success !== false;
            };
            s.on('datachanged', state.changed); s.on('load', state.loaded);
            root[args.token] = state;
          }
          const st = root[args.token];
          return st ? {grid_id:st.grid_id, changes:st.changes, loads:st.loads, success:st.success} : null;
        }""", {"id": grid_id, "action": action, "token": token})
'''
if t.count(old)!=1: raise SystemExit(f'history block mismatch: {t.count(old)}')
t=t.replace(old,new)
old=r'''            if self._active_response is not None:
                frame, grid_id = self._active_response
                try:
                    self._history_response(frame, grid_id, "dispose")
                except Exception:
                    telemetry["response_cleanup_failed"] = True
                self._active_response = None
'''
new=r'''            if self._active_response is not None:
                frame, token = self._active_response
                try:
                    self._history_response(frame, None, "dispose", token)
                except Exception:
                    telemetry["response_cleanup_failed"] = True
                self._active_response = None
'''
if t.count(old)!=1: raise SystemExit(f'cleanup block mismatch: {t.count(old)}')
t=t.replace(old,new)
p.write_text(t,encoding='utf-8')
