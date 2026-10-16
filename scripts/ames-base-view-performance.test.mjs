import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Base Local paging trusts the line-scoped page response and avoids a catalog roundtrip per page',()=>{
  const source=fs.readFileSync('ames/console-base-view.mjs','utf8');
  const start=source.indexOf('async function connectedDataset');
  const end=source.indexOf('\n  function sharedDataset',start);
  assert.ok(start>=0&&end>start,'connectedDataset must remain explicit');
  const block=source.slice(start,end);
  assert.doesNotMatch(block,/auxiliary\(['"]catalog['"]/,'paging must not query the catalog before every page');
  assert.match(block,/auxiliary\(['"]dataset['"]/,'paging must request the selected dataset');
  assert.match(block,/data\?\.total/,'server exact total must be preferred when available');
  assert.match(block,/data\?\.has_more===true/,'contextual datasets must use server look-ahead instead of inventing completeness');
  assert.match(block,/offset:requestPage\.offset/,'page offset must be sent to the agent');
});
