import {factoryWindow} from './operational-period.mjs';
import {factoryWallMinute} from './history.mjs';

// Read scope only. Neither this module nor the store can schedule a MES query.
export function readingPeriod(mode='today',{now=new Date(),config={},start,end}={}){
  if(!['latest','today','previous','custom'].includes(mode))throw Error('invalid_reading_period');
  const window=factoryWindow(now); // Operational day is 07:00 São Paulo, not a shift.
  if(mode==='today'||mode==='latest')return {mode,start:window.start_at,end:window.end_at};
  if(mode==='custom'){
    start=factoryWallMinute(start);end=factoryWallMinute(end);
    if(!start||!end||start>=end)throw Error('invalid_reading_range');
    return {mode,start,end};
  }
  let day=Date.parse(window.operational_date+'T12:00:00Z');
  const closed=new Set(config.non_production_dates||[]),extra=new Set(config.extra_production_dates||[]);
  for(let i=0;i<731;i++){
    day-=86400000;
    const date=new Date(day).toISOString().slice(0,10),weekday=new Date(day).getUTCDay();
    if(extra.has(date)||(weekday>=1&&weekday<=5&&!closed.has(date)))return {
      mode,start:date+'T07:00',end:new Date(day+86400000).toISOString().slice(0,10)+'T07:00'
    };
  }
  throw Error('previous_production_day_unavailable');
}

export function matchesReadingPeriod(payload,selection){
  if(!selection)return true;
  const p=payload?.summary?.period||{};
  const start=factoryWallMinute(p.start_at),end=factoryWallMinute(p.end_at);
  if(selection.mode==='latest')return !!start&&!!end&&end>start&&start.endsWith('T07:00')&&start<=selection.start&&['today','live','monitor_today','previous_day','historical_refresh'].includes(String(p.mode||'').toLowerCase());
  if(start!==selection.start||!end||end<=start)return false;
  if(selection.mode==='custom')return end===selection.end;
  // A custom investigation never becomes a daily population, even on identical dates.
  if(!['today','live','monitor_today','previous_day'].includes(String(p.mode||'').toLowerCase()))return false;
  return end<=selection.end;
}
