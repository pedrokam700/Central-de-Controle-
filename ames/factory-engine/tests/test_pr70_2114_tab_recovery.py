"""Guard the 2114 OPC tab recovery without querying or changing real MES."""
import unittest
from unittest.mock import patch

from ames.tela_2114 import Tela2114, SHIFT_UNCONFIRMED
from ames.navigation import AmesNavigation


class Locator:
    def __init__(self, count=0, value='', body=''):
        self.n=count
        self.value=value
        self.body=body
    def count(self): return self.n
    @property
    def first(self): return self
    def input_value(self, timeout=800): return self.value
    def inner_text(self, timeout=700): return self.body


class Page:
    def __init__(self, url, *, valid=True, focused=False, closed=False, shift='day shift'):
        self.url=url
        self.valid=valid
        self.focused=focused
        self.closed=closed
        self.shift=shift
    def is_closed(self): return self.closed
    def title(self): return 'A-MES'
    def locator(self, selector):
        if selector=='input[name="snImei"]:visible':return Locator(1 if self.valid else 0)
        if selector=='input[name="desc"]:visible':return Locator(1 if self.valid else 0,self.shift)
        if selector=='body':return Locator(body='AWIP2114-Tr Defect Lot By Hand' if self.valid else 'login')
        raise AssertionError(selector)
    def evaluate(self, script):return self.focused


class Browser:
    def __init__(self, pages):self.pages=pages


ROUTE='http://172.29.185.215/asymes/opc/#UAWIP.form.TrDefectLotByHandView'


class Recovery(unittest.TestCase):
    def test_pinned_view_wins_over_another_focused_duplicate(self):
        original=Page(ROUTE)
        duplicate=Page(ROUTE,focused=True)
        reader=Tela2114(Browser([original,duplicate]),'.')
        reader.target_page=original
        self.assertIs(reader._page(),original)

    def test_missing_tab_is_reopened_once_and_pinned(self):
        recovered=Page(ROUTE)
        reader=Tela2114(Browser([]),'.')
        with patch.object(AmesNavigation,'ensure_2114',return_value=recovered) as ensure:
            self.assertIs(reader._page(),recovered)
            self.assertIs(reader._page(),recovered)
        ensure.assert_called_once_with(timeout_s=12.0)

    def test_recovery_rejects_page_without_2114_query_field(self):
        reader=Tela2114(Browser([]),'.')
        with patch.object(AmesNavigation,'ensure_2114',return_value=Page(ROUTE,valid=False)):
            with self.assertRaisesRegex(RuntimeError,'2114_VIEW_NOT_CONFIRMED_AFTER_RECOVERY'):
                reader._page()

    def test_missing_session_stays_unconfirmed_and_never_fabricates_shift(self):
        reader=Tela2114(Browser([]),'.')
        with patch.object(AmesNavigation,'ensure_2114',side_effect=RuntimeError('LOGIN_AMES_REQUIRED')):
            self.assertEqual(reader.turno_atual(),SHIFT_UNCONFIRMED)
        self.assertIn('LOGIN_AMES_REQUIRED',reader.last_shift_error)

    def test_ambiguous_duplicate_tabs_fail_closed(self):
        reader=Tela2114(Browser([Page(ROUTE),Page(ROUTE)]),'.')
        with patch.object(AmesNavigation,'ensure_2114') as ensure:
            with self.assertRaisesRegex(RuntimeError,'2 abas 2114 validas'):
                reader._page()
            ensure.assert_not_called()

    def test_closed_pinned_page_recovers_to_valid_page(self):
        reader=Tela2114(Browser([]),'.')
        reader.target_page=Page(ROUTE,closed=True)
        recovered=Page(ROUTE)
        with patch.object(AmesNavigation,'ensure_2114',return_value=recovered):
            self.assertIs(reader._page(),recovered)


if __name__=='__main__':unittest.main()
