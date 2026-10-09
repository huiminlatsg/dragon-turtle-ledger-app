import { describe, it, expect } from "vitest";
import { validRepeatDate, tomorrowSgt, repeatFormErrors } from "@/lib/recurring";
const base={name:'Mobile',frequency:'monthly',start_date:'2026-01-31',end_date:'',amount:'35.50',notes:''};
describe('recurring form boundaries',()=>{
 it('accepts open-ended monthly/yearly schedules and inclusive last dates',()=>{
  expect(repeatFormErrors(base,'SGD','2026-10-07')).toEqual([]);
  expect(repeatFormErrors({...base,frequency:'yearly',end_date:base.start_date},'SGD','2026-10-07')).toEqual([]);
 });
 it('rejects invalid dates and past effective changes',()=>{
  expect(validRepeatDate('2026-02-29')).toBe(false);expect(validRepeatDate('2024-02-29')).toBe(true);
  expect(repeatFormErrors({...base,end_date:'2025-12-31'},'SGD','2026-10-07')).toContain('repeat.dateError');
  expect(repeatFormErrors({...base,series_id:'existing',effective_from:'2026-10-07'},'SGD','2026-10-07')).toContain('repeat.futureError');
 });
 it('requires SGD equivalents for foreign ledgers and cent precision',()=>{
  expect(repeatFormErrors(base,'USD','2026-10-07')).toContain('repeat.amountError');
  expect(repeatFormErrors({...base,amount_sgd:'45'},'USD','2026-10-07')).toEqual([]);
  for(const amount of ['-1','0','NaN','1.001']) expect(repeatFormErrors({...base,amount},'SGD','2026-10-07')).toContain('repeat.amountError');
 });
 it('calculates future changes using Singapore time across year boundaries',()=>{
  expect(tomorrowSgt(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-02');
 });
});
