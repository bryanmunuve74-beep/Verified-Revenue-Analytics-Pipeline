import request from 'supertest';
// Assuming you export `app` from server.ts, or you can import your express app instance
// import { app } from '../server'; 

describe('M-PESA Express Backend API Tests', () => {
  
  test('Phone number normalization logic test', () => {
    const normalizePhone = (value: unknown): string => {
      const phone = String(value ?? '').replace(/\s+/g, '');
      if (phone.startsWith('0')) {
        return `254${phone.slice(1)}`;
      }
      return phone;
    };

    expect(normalizePhone('0712345678')).toBe('254712345678');
    expect(normalizePhone('254712345678')).toBe('254712345678');
  });

});