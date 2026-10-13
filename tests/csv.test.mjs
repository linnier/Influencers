import test from 'node:test';
import assert from 'node:assert/strict';
import { influencersCSV } from '../src/lib/csv.ts';
test('CSV preserves Chinese, quotes and line breaks while neutralizing spreadsheet formulas',()=>{
  const value={name:'=HYPERLINK("evil")',handle:' @SUM(1)',platform:'小红书',category:'生活方式',followers:100,engagement:5,quote:1000,status:'待联系',contact:'test@example.test',city:'上海',notes:'一行,"引号"\n第二行'};
  const csv=influencersCSV([value]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('达人名称'));assert.ok(csv.includes(`"'=HYPERLINK(""evil"")"`));assert.ok(csv.includes(`"' @SUM(1)"`));assert.ok(csv.includes('"一行,""引号""\n第二行"'));
});
