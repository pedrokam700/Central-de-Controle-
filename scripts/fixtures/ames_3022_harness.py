"""Browser boundary only: production JS, parser, adapter and SQLite run unchanged."""
import json
import subprocess
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


class Locator:
    def __init__(self, fixture, kind):
        self.fixture, self.kind = fixture, kind
        self.first = self
    def count(self): return 1 if self.kind != 'table' else 0
    def is_visible(self, **kwargs): return True
    def wait_for(self, **kwargs): pass
    def fill(self, value, **kwargs):
        if self.fixture.mask_blocks_input and self.fixture.clock < self.fixture.mask_until_s:
            self.fixture.advance(min(float(kwargs.get('timeout',1200))/1000,
                                     self.fixture.mask_until_s-self.fixture.clock))
            raise RuntimeError('Timeout waiting for input: <div class="x-mask"> intercepts pointer events')
        self.fixture.call(op='fill', value=value)
    def input_value(self, **kwargs): return self.fixture.call(op='value')
    def click(self, **kwargs):
        if kwargs.get('trial'):
            # Playwright's trial click checks pointer actionability, but MUST
            # NOT dispatch a new MES request. Model the 3022 ExtJS mask.
            self.fixture.trial_attempts += 1
            if self.fixture.clock < self.fixture.trial_not_ready_until_s:
                self.fixture.advance(min(float(kwargs.get('timeout',1800))/1000,
                                         self.fixture.trial_not_ready_until_s-self.fixture.clock))
                raise TimeoutError(
                    'Locator.click: Timeout ' + str(kwargs.get('timeout',1800))
                    + 'ms exceeded.\\nCall log: - attempting click action (trial run)'
                    + ' - waiting for element to be visible, enabled and stable'
                )
            if self.fixture.clock < self.fixture.mask_until_s:
                self.fixture.advance(min(float(kwargs.get('timeout',650))/1000,
                                         self.fixture.mask_until_s-self.fixture.clock))
                raise RuntimeError(
                    'Timeout waiting for button Views: <div class="x-mask"> intercepts pointer events'
                )
            return
        # A real Playwright locator has native actionability waiting. Unlike
        # the removed trial=True preflight, this is its one actual View click.
        if self.fixture.clock < self.fixture.trial_not_ready_until_s:
            self.fixture.advance(min(float(kwargs.get('timeout',12000))/1000,
                                     self.fixture.trial_not_ready_until_s-self.fixture.clock))
            if self.fixture.clock < self.fixture.trial_not_ready_until_s:
                raise TimeoutError(
                    'Locator.click: Timeout ' + str(kwargs.get('timeout',12000))
                    + 'ms exceeded. Call log: waiting for element to be visible, enabled and stable'
                )
        if self.fixture.clock < self.fixture.mask_until_s:
            self.fixture.advance(min(float(kwargs.get('timeout',12000))/1000,
                                     self.fixture.mask_until_s-self.fixture.clock))
            if self.fixture.clock < self.fixture.mask_until_s:
                raise TimeoutError('Locator.click: Timeout while x-mask intercepts pointer events')
        if self.fixture.mask_on_actual_click:
            self.fixture.mask_on_actual_click = False
            raise RuntimeError('Locator.click Timeout: <div class="x-mask"> intercepts pointer events')
        self.fixture.call(op='click')
        if (self.fixture.trial_not_ready_after_submits is not None and
                len(self.fixture.call(op='state')['submitted']) >= self.fixture.trial_not_ready_after_submits):
            self.fixture.trial_not_ready_until_s = (
                self.fixture.clock + self.fixture.trial_not_ready_duration_s)
            self.fixture.trial_not_ready_after_submits = None
        if (self.fixture.mask_after_submits is not None and
                len(self.fixture.call(op='state')['submitted']) >= self.fixture.mask_after_submits):
            self.fixture.mask_until_s = self.fixture.clock + self.fixture.mask_duration_s
            self.fixture.mask_blocks_input = True
            self.fixture.mask_after_submits = None
    def inner_text(self, **kwargs): return 'AWIP3022 View Lot History'


class Ext3022Fixture:
    url = 'http://fixture/AWIP3022/VwViewLotHistoryView'
    def __init__(self, collector, plans, rows=(), hidden=(), mask_until_s=0.0,
                 mask_after_submits=None, mask_duration_s=0.0,
                 mask_on_actual_click=False, mask_blocks_input=False,
                 trial_not_ready_until_s=0.0, trial_not_ready_after_submits=None,
                 trial_not_ready_duration_s=0.0):
        self.collector, self.clock = collector, 0.0
        self.mask_until_s, self.trial_attempts = float(mask_until_s), 0
        self.mask_after_submits = mask_after_submits
        self.mask_duration_s = float(mask_duration_s)
        self.mask_on_actual_click = bool(mask_on_actual_click)
        self.mask_blocks_input = bool(mask_blocks_input)
        self.trial_not_ready_until_s=float(trial_not_ready_until_s)
        self.trial_not_ready_after_submits=trial_not_ready_after_submits
        self.trial_not_ready_duration_s=float(trial_not_ready_duration_s)
        self.process = subprocess.Popen(['node', str(ROOT/'scripts/fixtures/ames-3022-ext.cjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
        self.frames = [self]
        self.call(op='setup', plans=plans, rows=list(rows), hidden=list(hidden))
        self.tela = collector.Tela3022(self, ROOT/'ames/factory-engine')
    def call(self, **message):
        self.process.stdin.write(json.dumps(message)+'\n');self.process.stdin.flush()
        response=json.loads(self.process.stdout.readline())
        if 'error' in response: raise RuntimeError(response['error'])
        return response['result']
    def evaluate(self, code, arg=None): return self.call(op='eval', code=code, arg=arg)
    def locator(self, selector): return Locator(self, 'table' if selector=='table' else 'input')
    def get_by_role(self, *args, **kwargs): return Locator(self, 'button')
    def choose_active_page(self, hint): return self
    def connect(self): return self
    def disconnect(self): pass
    def advance(self, seconds):
        self.clock+=seconds
        self.call(op='advance', ms=seconds*1000)
    def __enter__(self):
        self.stack=ExitStack()
        for name in ('time','perf_counter'):
            self.stack.enter_context(patch.object(self.collector.time,name,side_effect=lambda:self.clock))
        self.stack.enter_context(patch.object(self.collector.time,'perf_counter_ns',side_effect=lambda:int(self.clock*1e9)))
        self.stack.enter_context(patch.object(self.collector.time,'sleep',side_effect=self.advance))
        return self
    def __exit__(self,*args):
        self.stack.close()
        self.process.stdin.close();self.process.wait(timeout=5);self.process.stdout.close()


def history_rows(label, count=2, identity=None):
    return [{'Hist Seq':i+1,'Working Oper Code':'A5162','Working Oper':'Camera inspection',
             'Current Oper Code':'A5201','Current Oper':'Assembly','Station':'A5162',
             'Tran Desc':'END LOT','Tran Time':f'2026-10-16 10:{i:02}:00',
             'Tran User Id':label,'Shift':'DAY','Cutoff Date':'2026-10-16','TRAN CMF3':'raw preserved',
             **({'Lot Id':identity} if identity else {})} for i in range(count)]
