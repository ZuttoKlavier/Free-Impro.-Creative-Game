import { test, expect } from '@playwright/test';
test('name and classroom code creates distinct students, persists session, and rejects invalid code', async ({page,browser}) => {
 const headers={Origin:process.env.TEST_APP_ORIGIN};
 await page.request.post('/api/teacher/register',{headers,data:{username:'t'+crypto.randomUUID().slice(0,8),password:'password123',name:'老师',role:'teacher'}});
 const made=await page.request.post('/api/teacher/classrooms',{headers,data:{name:'免密码课堂',capacity:1,background:'教室'}}); const room=(await made.json()).classroom;
 await page.goto('/'); await page.locator('#classroom-tab').click();
 await expect(page.locator('#auth-password')).toHaveAttribute('type','text');
 await page.locator('#auth-username').fill('小明'); await page.locator('#auth-password').fill(room.code); await page.locator('#auth-submit').click();
 await expect(page.locator('#identity')).toContainText('小明'); await expect(page.locator('#identity')).not.toContainText('#');
 const first=(await (await page.request.get('/api/student/me')).json()).user;
 expect(first.username).toBe('小明#0000');
 await page.reload(); await page.locator('#classroom-tab').click(); await expect(page.locator('#auth-panel')).toBeHidden();
 const again=await page.request.post('/api/student/enter-classroom',{headers,data:{name:'小明',code:room.code}}); expect((await again.json()).user.id).toBe(first.id);
 const other=await browser.newContext();try {
 const second=await other.request.post(process.env.TEST_APP_ORIGIN+'/api/student/enter-classroom',{headers,data:{name:'小明',code:room.code}});const user=(await second.json()).user;expect(user.username).toBe('小明#0001');expect(user.id).not.toBe(first.id);
 const invalid=await other.request.post(process.env.TEST_APP_ORIGIN+'/api/student/enter-classroom',{headers,data:{name:'错误码',code:'abcdef'}});expect(invalid.status()).toBe(400);
 const teacherRoute=await other.request.post(process.env.TEST_APP_ORIGIN+'/api/teacher/enter-classroom',{headers,data:{name:'小明',code:room.code}});expect(teacherRoute.status()).toBe(403);
 const snapshot=await page.request.get('/api/teacher/classrooms/'+room.id);const data=await snapshot.json();expect(data.classroom.members).toHaveLength(2);expect(data.classroom.members.filter(m=>m.admitted)).toHaveLength(1);
 } finally {await other.close();}
});
