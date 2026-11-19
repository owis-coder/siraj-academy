import { describe, it, expect } from 'vitest';
import { fullNameError, usernameError, isPasswordValid, passwordChecks, describeUserAgent } from './accountRules';

describe('username rules', () => {
  it('accepts a valid username', () => {
    expect(usernameError('testuser1')).toBeNull();
  });
  it('rejects an Arabic username', () => {
    expect(usernameError('سارة12')).not.toBeNull();
  });
  it('rejects a username with a space', () => {
    expect(usernameError('test user')).not.toBeNull();
  });
  it('rejects a username with Chinese characters', () => {
    expect(usernameError('学生123')).not.toBeNull();
  });
  it('rejects a username shorter than 3', () => {
    expect(usernameError('ab')).not.toBeNull();
  });
  it('rejects a username longer than 30', () => {
    expect(usernameError('a'.repeat(31))).not.toBeNull();
  });
});

describe('password rules', () => {
  it('accepts a valid password', () => {
    expect(isPasswordValid('SirajPass2026')).toBe(true);
  });
  it('rejects a password without an uppercase letter', () => {
    expect(isPasswordValid('sirajpass2026')).toBe(false);
  });
  it('rejects a password without a lowercase letter', () => {
    expect(isPasswordValid('SIRAJ2026')).toBe(false);
  });
  it('rejects a password without a digit', () => {
    expect(isPasswordValid('SirajPassword')).toBe(false);
  });
  it('rejects a password with symbols', () => {
    expect(isPasswordValid('Siraj@2026')).toBe(false);
  });
  it('rejects a password shorter than 9', () => {
    expect(isPasswordValid('S2026')).toBe(false);
  });
  it('reports the check keys for a valid password', () => {
    const keys = passwordChecks('Siraj123').map((c) => c.key);
    expect(keys.sort()).toEqual(['digit', 'len', 'lower', 'upper', 'charset'].sort());
  });
});

describe('user agent summarization', () => {
  it('summarizes a chrome window', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    const info = describeUserAgent(ua);
    expect(info.browserKey).toMatch('chrome');
    expect(info.osKey).toMatch('windows');
    expect(info.deviceKey).toMatch('desktop');
  });
  it('summarizes a mobile android user', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    const info = describeUserAgent(ua);
    expect(info.deviceKey).toMatch('phone');
  });
  it('fails safely with no user agent', () => {
    const info = describeUserAgent(null);
    expect(info.browserKey).toBe('device.unknown');
    expect(info.osKey).toBe('device.unknown');
    expect(info.deviceKey).toBe('device.unknown');
  });
});
