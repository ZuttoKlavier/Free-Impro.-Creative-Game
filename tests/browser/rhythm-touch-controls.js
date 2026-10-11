export async function setBarsTouch(page, bars) {
  const current = Number(await page.locator('[data-bars]').textContent());
  const button = page.getByRole('button', { name: bars > current ? '增加小节' : '减少小节', exact: true });
  for (let i = 0; i < Math.abs(bars - current); i++) await button.tap();
}

export async function dragTempoTouch(page, bpm, beforeRelease) {
  const slider = page.getByRole('slider', { name: '试听速度', exact: true });
  const box = await slider.boundingBox(), current = Number(await slider.inputValue());
  const x = value => box.x + 8 + (value - 40) / 200 * (box.width - 16), y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(current), y }] });
  for (let i = 1; i <= 4; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(current + (bpm - current) * i / 4), y }] });
  if (beforeRelease) await beforeRelease();
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
}

export async function setTempoTouch(page, bpm) {
  await dragTempoTouch(page, bpm);
  const current = Number(await page.getByRole('slider', { name: '试听速度', exact: true }).inputValue());
  const button = page.getByRole('button', { name: bpm > current ? '加快试听速度' : '减慢试听速度', exact: true });
  for (let i = 0; i < Math.abs(bpm - current); i++) await button.tap();
}
