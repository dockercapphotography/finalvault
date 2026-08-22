/**
 * zipQueueWorkflow.js — Tier 3 async ZIP job Workflow
 *
 * PLACEHOLDER as of this commit. Exists so `POST /zip-jobs` has a real
 * Workflow binding to trigger and the Worker deploys successfully.
 * The actual fetch → zip → multipart-upload → notify step sequence is
 * built in the next step of docs/tier3-async-zip-queue-spec.md's build
 * sequence (section 8, step 4). Until then this just marks the job
 * 'processing' then immediately 'failed' with a clear message, so any
 * job that accidentally gets queued against this placeholder fails
 * loudly instead of hanging forever in 'queued'.
 */

import { WorkflowEntrypoint } from 'cloudflare:workers'

export class ZipQueueWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId } = event.payload

    await step.do('mark-not-yet-implemented', async () => {
      await fetch(`${this.env.SUPABASE_URL}/rest/v1/zip_jobs?id=eq.${jobId}`, {
        method: 'PATCH',
        headers: {
          apikey: this.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${this.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'failed',
          error_message: 'ZIP queue Workflow not yet implemented -- placeholder only.',
        }),
      })
    })

    return { jobId, status: 'failed', reason: 'placeholder' }
  }
}
