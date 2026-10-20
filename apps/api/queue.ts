import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Connect to local Redis
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Create an M-PESA Job Queue
export const mpesaQueue = new Queue('mpesa-jobs', { connection });

// Create a Worker to process jobs in the background with automatic retries
const worker = new Worker(
  'mpesa-jobs',
  async (job) => {
    const { orderId, checkoutRequestId } = job.data;
    console.log(`Processing background job for order ${orderId} (Attempt ${job.attemptsMade + 1})`);

    // Here you can put background tasks, like double-checking status 
    // or triggering server-side post-payment logic safely.
  },
  {
    connection,
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000, // per 1 second
    },
  }
);

// Event listeners for debugging
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});