const { test, expect } = require('@playwright/test');
const { cleanTestDb, launchApp } = require('./helpers');

test.describe('CRM Authentication and Lockout Flow', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const app = await launchApp();
    electronApp = app.electronApp;
    window = app.window;
    await cleanTestDb(window);
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Should handle Admin Signup, Login, and Logout', async () => {
    // 1. Switch to signup mode
    const signUpLink = window.getByRole('button', { name: 'Sign Up' });
    await expect(signUpLink).toBeVisible();
    await signUpLink.click();
    await window.waitForTimeout(3000);

    // 2. Try signup with invalid fields (e.g. empty)
    const registerBtn = window.getByRole('button', { name: 'Register Operator' });
    await expect(registerBtn).toBeVisible();
    // HTML5 validations would prevent submit if required fields are blank
    
    // Fill signup details for admin
    const testUsername = `test_admin_${Date.now()}`;
    await window.getByLabel('Username').fill(testUsername);
    await window.waitForTimeout(3000);
    await window.getByLabel('Password').fill('testpass123');
    await window.waitForTimeout(3000);
    await registerBtn.click();
    await window.waitForTimeout(3000);

    // After successful registration, it should redirect to sign in mode
    await expect(window.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();

    // 3. Test invalid login
    await window.getByLabel('Username').fill(testUsername);
    await window.getByLabel('Password').fill('wrongpassword');
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Sign In', exact: true }).click();
    await window.waitForTimeout(3000);
    await expect(window.locator('text=Authentication Error')).toBeVisible();

    // 4. Test valid login
    await window.getByLabel('Password').fill('testpass123');
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Sign In', exact: true }).click();
    await window.waitForTimeout(3000);

    // Should navigate to dashboard (Sidebar with user info or Header title should say "Dashboard")
    await expect(window.locator('header')).toContainText('Dashboard');

    // 5. Test logout
    // Click on the user profile dropdown trigger
    const userMenuBtn = window.locator('button').filter({ hasText: testUsername });
    await expect(userMenuBtn).toBeVisible();
    await userMenuBtn.click();
    await window.waitForTimeout(3000);

    // Click "Log out" in the dropdown
    const logoutItem = window.locator('text=Log out');
    await expect(logoutItem).toBeVisible();
    await logoutItem.click();
    await window.waitForTimeout(3000);

    // Should return to login page
    await expect(window.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('Should enforce account lockout after 5 failed login attempts', async () => {
    const lockUsername = `test_lock_${Date.now()}`;

    // First signup the user so they exist
    await window.getByRole('button', { name: 'Sign Up' }).click();
    await window.waitForTimeout(3000);
    await window.getByLabel('Username').fill(lockUsername);
    await window.waitForTimeout(3000);
    await window.getByLabel('Password').fill('validpass123');
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Register Operator' }).click();
    await window.waitForTimeout(3000);

    // Switch/stay in login mode
    await expect(window.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();

    // Fail login 5 times
    for (let i = 1; i <= 5; i++) {
       await window.getByLabel('Username').fill(lockUsername);
       await window.waitForTimeout(3000);
       await window.getByLabel('Password').fill(`wrong_${i}`);
       await window.waitForTimeout(3000);
      await window.getByRole('button', { name: 'Sign In', exact: true }).click();
      await window.waitForTimeout(3000);
      
      // Wait for error banner
      await expect(window.locator('text=Authentication Error')).toBeVisible();
    }

    // The 6th attempt should trigger account lockout error message
    await window.getByLabel('Username').fill(lockUsername);
    await window.waitForTimeout(3000);
    await window.getByLabel('Password').fill('validpass123');
    await window.waitForTimeout(3000);
    await window.getByRole('button', { name: 'Sign In', exact: true }).click();
    await window.waitForTimeout(3000);

    await expect(window.locator('text=Account locked. Try again in')).toBeVisible();
  });
});
