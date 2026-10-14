export const BASE_PAGE_SIZES=Object.freeze([50,100,250]);
export const BASE_MAX_ROWS=100000;

export function normalizeBasePageSize(value){
  const parsed=Number(value);
  return BASE_PAGE_SIZES.includes(parsed)?parsed:100;
}

export function baseIncrementalLimit(page,pageSize,max=BASE_MAX_ROWS){
  const safePage=Math.max(0,Number.isFinite(Number(page))?Math.trunc(Number(page)):0);
  const safeSize=normalizeBasePageSize(pageSize);
  const safeMax=Math.max(safeSize,Number.isFinite(Number(max))?Math.trunc(Number(max)):BASE_MAX_ROWS);
  return Math.min(safeMax,(safePage+1)*safeSize);
}

export function basePageWindow(total,page,pageSize,loadedRows){
  const safeSize=normalizeBasePageSize(pageSize);
  const safeTotal=Math.max(0,Number.isFinite(Number(total))?Math.trunc(Number(total)):0);
  const pages=Math.max(1,Math.ceil(safeTotal/safeSize));
  const safePage=Math.max(0,Math.min(pages-1,Number.isFinite(Number(page))?Math.trunc(Number(page)):0));
  const start=safePage*safeSize;
  const loaded=Math.max(0,Number.isFinite(Number(loadedRows))?Math.trunc(Number(loadedRows)):0);
  const end=Math.min(start+safeSize,safeTotal,loaded);
  return Object.freeze({
    page:safePage,
    pageSize:safeSize,
    pages,
    total:safeTotal,
    start,
    end,
    displayStart:safeTotal&&end>start?start+1:0,
    hasPrev:safePage>0,
    hasNext:start+safeSize<safeTotal,
    needsMore:loaded<Math.min((safePage+1)*safeSize,safeTotal),
  });
}
