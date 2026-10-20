import 'dotenv/config';
import { mpesaQueue } from './queue';
import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(
  cors({
    origin: 'http://localhost:3001',
  })
);

app.use(express.json());


// --------------------------------------------------
// PostgreSQL
// --------------------------------------------------

const pool = new Pool({
  user: process.env.DATABASE_USER,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: Number(process.env.DATABASE_PORT || 5432),
});


// --------------------------------------------------
// M-PESA configuration
// --------------------------------------------------

const MPESA_BASE_URL =
  process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke';

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!;
const BUSINESS_SHORT_CODE = process.env.MPESA_BUSINESS_SHORT_CODE!;
const PASSKEY = process.env.MPESA_PASSKEY!;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL!;


// --------------------------------------------------
// Helpers
// --------------------------------------------------

const getMpesaToken = async (): Promise<string> => {
  const auth = Buffer.from(
    `${CONSUMER_KEY}:${CONSUMER_SECRET}`
  ).toString('base64');

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      timeout: 10000,
    }
  );

  return response.data.access_token;
};


const getTimestamp = (): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const values: Record<string, string> = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return (
    values.year +
    values.month +
    values.day +
    values.hour +
    values.minute +
    values.second
  );
};


const normalizePhone = (value: unknown): string => {
  const phone = String(value ?? '').replace(/\s+/g, '');

  if (phone.startsWith('0')) {
    return `254${phone.slice(1)}`;
  }

  return phone;
};


// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');

    res.json({
      status: 'ok',
      api_time: new Date().toISOString(),
      database_time: dbResult.rows[0].now,
    });
  } catch (error) {
    console.error('Health check database error:', error);

    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
    });
  }
});


// --------------------------------------------------
// Checkout
// --------------------------------------------------

app.post('/api/checkout', async (req, res) => {
  let orderId: number | null = null;
  let dbClient;

  try {
    const { phone_number, amount } = req.body;

    const phone = normalizePhone(phone_number);
    const numericAmount = Number(amount);

    // Basic validation
    if (!/^254\d{9}$/.test(phone)) {
      return res.status(400).json({
        error: 'Invalid phone number. Use format 2547XXXXXXXX.',
      });
    }

    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: 'Amount must be a positive whole number.',
      });
    }

    dbClient = await pool.connect();

    // ----------------------------------------------
    // 0. IDEMPOTENCY CHECK (Milestone 5)
    // ----------------------------------------------
    const pendingCheck = await dbClient.query(
      `SELECT id FROM orders 
       WHERE phone_number = $1 
         AND status = 'PENDING' 
         AND created_at >= NOW() - INTERVAL '1 minute'`,
      [phone]
    );

    if (pendingCheck.rows.length > 0) {
      dbClient.release();
      return res.status(429).json({ 
        error: 'An M-PESA prompt is already active on your phone. Please check your screen or wait a minute before trying again.' 
      });
    }

    // ----------------------------------------------
    // 1. Create local order
    // ----------------------------------------------

    const dbResult = await dbClient.query(
      `
      INSERT INTO orders
        (phone_number, amount, status)
      VALUES
        ($1, $2, $3)
      RETURNING *
      `,
      [phone, numericAmount, 'PENDING']
    );

    const order = dbResult.rows[0];
    orderId = order.id;
    const order = dbResult.rows[0];

if (process.env.PAYMENT_MODE === "simulation") {
  setTimeout(async () => {
    try {
      // Simulate a successful payment 75% of the time
      const success = Math.random() < 0.75;

      await pool.query(
        `
        UPDATE orders
        SET status = $1
        WHERE id = $2
        `,
        [
          success ? "SUCCESS" : "FAILED",
          order.id,
        ]
      );

      console.log(
        `Simulation: Order ${order.id} -> ${
          success ? "SUCCESS" : "FAILED"
        }`
      );
    } catch (error) {
      console.error(
        "Simulation update failed:",
        error
      );
    }
  }, 3000);

  return res.json({
    message: "Simulated payment initiated",
    order: {
      id: order.id,
      status: "PENDING",
    },
  });
}

    // ----------------------------------------------
    // 2. Get M-PESA token
    // ----------------------------------------------

    const token = await getMpesaToken();


    // ----------------------------------------------
    // 3. Generate timestamp/password
    // ----------------------------------------------

    const timestamp = getTimestamp();

    const password = Buffer.from(
      `${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`
    ).toString('base64');


    // ----------------------------------------------
    // 4. Send STK Push
    // ----------------------------------------------

    const stkResponse = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: BUSINESS_SHORT_CODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: numericAmount,
        PartyA: phone,
        PartyB: BUSINESS_SHORT_CODE,
        PhoneNumber: phone,
        CallBackURL: CALLBACK_URL,
        AccountReference: `Order_${order.id}`,
        TransactionDesc: 'Test Payment',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const mpesa = stkResponse.data;


    // ----------------------------------------------
    // 5. Check Safaricom's application response
    // ----------------------------------------------

    if (mpesa.ResponseCode !== '0') {
      await dbClient.query(
        `
        UPDATE orders
        SET
          status = $1,
          result_desc = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          'FAILED',
          mpesa.ResponseDescription || 'M-PESA rejected request',
          order.id,
        ]
      );

      dbClient.release();
      return res.status(502).json({
        error: mpesa.ResponseDescription || 'M-PESA rejected request',
      });
    }


    // ----------------------------------------------
    // 6. Save Safaricom request IDs
    // ----------------------------------------------

    await dbClient.query(
      `
      UPDATE orders
      SET
        merchant_request_id = $1,
        checkout_request_id = $2,
        updated_at = NOW()
      WHERE id = $3
      `,
      [
        mpesa.MerchantRequestID,
        mpesa.CheckoutRequestID,
        order.id,
      ]
    );
// Inside your /api/checkout route after a successful STK Push:
await mpesaQueue.add(
  'verify-payment',
  { orderId: order.id, checkoutRequestId: mpesa.CheckoutRequestID },
  {
    attempts: 3, // Retry up to 3 times if it fails
    backoff: {
      type: 'exponential',
      delay: 5000, // Wait 5s, then 10s, then 20s between retries
    },
  }
);
    dbClient.release();

    // ----------------------------------------------
    // 7. Respond to frontend
    // ----------------------------------------------

    return res.status(200).json({
      message: 'STK Push sent successfully',
      order: {
        id: order.id,
        status: 'PENDING',
      },
      mpesaResponse: mpesa,
    });


  } catch (error: any) {

    console.error(
      'Checkout error:',
      error.response?.data || error.message
    );

    if (orderId !== null && dbClient) {
      await dbClient.query(
        `
        UPDATE orders
        SET
          status = $1,
          result_desc = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          error.code === 'ETIMEDOUT'
            ? 'INITIATION_UNKNOWN'
            : 'FAILED',

          error.code === 'ETIMEDOUT'
            ? 'Connection to M-PESA timed out. Initiation status is unknown.'
            : 'Failed to initiate M-PESA payment.',

          orderId,
        ]
      );
    }
    
    if (dbClient) dbClient.release();

    return res.status(502).json({
      error:
        error.code === 'ETIMEDOUT'
          ? 'M-PESA gateway connection timed out.'
          : 'Failed to initiate M-PESA payment.',
    });
  }
});


// --------------------------------------------------
// M-PESA callback
// --------------------------------------------------

app.post('/api/callback', async (req, res) => {
  try {
    console.log('SAFARICOM CALLBACK RECEIVED');
    console.log(JSON.stringify(req.body, null, 2));

    const stkCallback = req.body?.Body?.stkCallback;

    if (!stkCallback) {
      console.error('Invalid callback payload');

      return res.status(400).json({
        ResultCode: 1,
        ResultDesc: 'Invalid callback payload',
      });
    }

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = Number(stkCallback.ResultCode);
    const resultDesc = stkCallback.ResultDesc;

    let receiptNumber: string | null = null;
    const items = stkCallback.CallbackMetadata?.Item || [];
    const receiptItem = items.find(
      (item: any) => item.Name === 'MpesaReceiptNumber'
    );

    if (receiptItem) {
      receiptNumber = String(receiptItem.Value);
    }

    const newStatus =
      resultCode === 0
        ? 'SUCCESS'
        : 'FAILED';

    await pool.query(
      `
      UPDATE orders
      SET
        status = $1,
        result_code = $2,
        result_desc = $3,
        mpesa_receipt_number = $4,
        updated_at = NOW()
      WHERE checkout_request_id = $5
      `,
      [
        newStatus,
        resultCode,
        resultDesc,
        receiptNumber,
        checkoutRequestId,
      ]
    );

    if (resultCode === 0) {
      console.log('Payment Successful');
    } else {
      console.log(`Payment Failed: ${resultDesc}`);
    }

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success',
    });

  } catch (error) {
    console.error('Callback error:', error);
    return res.status(500).json({
      error: 'Failed to process callback',
    });
  }
});


// --------------------------------------------------
// Milestone 6: Reconciliation / Status Poll Endpoint
// --------------------------------------------------

app.get('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch current order status from DB
    const orderResult = await pool.query(
      'SELECT id, status, checkout_request_id FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // 2. If already resolved (SUCCESS or FAILED), return status immediately
    if (order.status !== 'PENDING') {
      return res.json({ status: order.status });
    }

    // If order has no checkout_request_id yet, it's still initializing
    if (!order.checkout_request_id) {
      return res.json({ status: 'PENDING' });
    }

    // 3. If PENDING, query Safaricom's STK Query API
    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = Buffer.from(
      `${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`
    ).toString('base64');

    try {
      const queryResponse = await axios.post(
        `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: BUSINESS_SHORT_CODE,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: order.checkout_request_id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const data = queryResponse.data;

      // ResultCode "0" means success
      if (data.ResultCode === '0') {
        await pool.query(
          `UPDATE orders 
           SET status = $1, result_code = $2, result_desc = $3, updated_at = NOW() 
           WHERE id = $4 AND status = 'PENDING'`,
          ['SUCCESS', 0, data.ResultDesc || 'The service request is processed successfully.', id]
        );
        return res.json({ status: 'SUCCESS' });
      } 
      else if (data.ResultCode) {
        await pool.query(
          `UPDATE orders 
           SET status = $1, result_code = $2, result_desc = $3, updated_at = NOW() 
           WHERE id = $4 AND status = 'PENDING'`,
          ['FAILED', Number(data.ResultCode), data.ResultDesc || 'Payment failed', id]
        );
        return res.json({ status: 'FAILED' });
      }

    } catch (mpesaError: any) {
      // Daraja throws errors (like 400/500) if user hasn't put PIN yet ("The transaction is being processed")
      const errMessage = mpesaError.response?.data?.errorMessage || mpesaError.message;
      console.log(`STK Query waiting state for order ${id}:`, errMessage);
      
      return res.json({ status: 'PENDING' });
    }

    return res.json({ status: 'PENDING' });

  } catch (error) {
    console.error('Error in reconciliation endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Server is running at http://localhost:${PORT}`
  );
});