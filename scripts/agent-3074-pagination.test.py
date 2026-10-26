"""3074 pagination visibility: incomplete ExtJS store cannot be a complete material history."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"ames"/"factory-engine"))
from ames.coverage_3074 import classify_3074_page
def main():
  assert classify_3074_page({"rows":[{"Barcode":"P1"}],"store_total_count":5})=={
    "status":"incomplete_page","returned":1,"reported_total":5,
    "reason":"extjs_store_total_exceeds_loaded_rows"}
  assert classify_3074_page({"rows":[{"Barcode":"P1"}],"store_total_count":1})["status"]=="returned"
  assert classify_3074_page({"rows":[],"store_total_count":0})["status"]=="returned"
  assert classify_3074_page({"rows":[{"Barcode":"P1"}],"store_total_count":None})["reported_total"] is None
  assert classify_3074_page({"rows":[{"Barcode":"P1"}],"store_total_count":"unknown"})["status"]=="returned"
  for count,reason in [(0,"extjs_store_total_below_loaded_rows"),(-1,"extjs_store_total_invalid")]:
    mismatch=classify_3074_page({"rows":[{"Barcode":"P1"}],"store_total_count":count})
    assert mismatch=={"status":"incomplete_page","returned":1,"reported_total":count,"reason":reason}
  assert classify_3074_page({"rows":[],"store_total_count":-1})["status"]=="incomplete_page"
  print("PASS 3074 incomplete pagination is not silently complete")
if __name__=="__main__":main()
