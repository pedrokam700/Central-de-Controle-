"""3022 AT names come exclusively from observed MES fields; no ID-to-name guess."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"ames"/"agent"))
from operator_evidence import operator_evidence

def test_operator_fields():
    row={'Tran User Id':'BRM00021','Tran User Desc':'Operador de teste','Tran Time':'2026-10-20 10:00:00','Working Oper Code':'A5150'}
    e=operator_evidence(row)
    assert e['operator_id']=='BRM00021'
    assert e['operator_name']=='Operador de teste'
    assert e['operator_fields']['operator_name']=='Tran User Desc'
    assert operator_evidence({'Tran User Id':'BRM00021'})['operator_name'] is None
    assert operator_evidence({'Tran User Id':'BRM00021','Some Memo':'John Doe'})['operator_name'] is None
    assert operator_evidence({'Tran User Id':'BRM00021','Operator Name':'Ana','Operator Name__2':'Luiza'})['operator_name']=='Ana'
    # The actual factory 3022 grid uses "Tran User", without "Name".
    exact=operator_evidence({'Tran User Id':'BRM00081','Tran User':'MARIA ALINE DE MIRANDA',
                             'Working Oper Code':'A6900','Tran Time':'2026-11-09 10:32:02'})
    assert exact['operator_id']=='BRM00081'
    assert exact['operator_name']=='MARIA ALINE DE MIRANDA'
    assert exact['operator_fields']['operator_name']=='Tran User'
    assert operator_evidence({'Tran User Id':'BRM00081','Unrelated Comment':'MARIA ALINE DE MIRANDA'})['operator_name'] is None
    print('PASS explicit 3022 AT name, no inferred person')

if __name__=='__main__':test_operator_fields()
