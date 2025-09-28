import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { ScmIntegrations } from '@backstage/integration';
import fetch from 'node-fetch';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const githubWorkflowAction = (options: { config: any }) =>
  createTemplateAction({
    id: 'custom-orchestrator:github-workflow',
    description: 'Trigger a GitHub Actions workflow and log completed steps only (UUID associated)',
    schema: {
      input: z.object({
        repo: z.string().describe('GitHub repo, e.g., org/repo'),
        workflowId: z.string().describe('Workflow filename or ID, e.g., ci.yaml'),
        ref: z.string().describe('Branch or tag to run the workflow on'),
      }),
      output: z.object({
        workflowUrl: z.string().describe('URL of the GitHub workflow run'),
        runUuid: z.string().describe('Unique UUID used to correlate the run'),
      }),
    },
    async handler(ctx) {
      const { repo, workflowId, ref } = ctx.input;

      // 🔑 Resolve GitHub token from app-config.yaml
      const integrations = ScmIntegrations.fromConfig(options.config);
      const githubIntegration = integrations.github.byHost('github.com');
      if (!githubIntegration?.config.token) {
        throw new Error('No GitHub token configured for github.com in app-config.yaml');
      }
      const token = githubIntegration.config.token;

      // Generate UUID to associate this run
      const runUuid = uuidv4();

      ctx.logger.info(
        `🚀 Triggering workflow '${workflowId}' on '${repo}' (UUID=${runUuid})`,
      );

      const triggerTime = new Date().toISOString();

      // Step 1: Trigger workflow with UUID input
      const triggerRes = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref,
            inputs: { backstageRunId: runUuid },
          }),
        },
      );

      if (!triggerRes.ok) {
        throw new Error(
          `Failed to trigger workflow '${workflowId}' on '${repo}': ${triggerRes.status} ${await triggerRes.text()}`,
        );
      }

      // Step 2: Poll for workflow run and match UUID via job name
      let runId: number | undefined;
      for (let attempt = 0; attempt < 12; attempt++) {
        const runsRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/runs?event=workflow_dispatch`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!runsRes.ok) {
          throw new Error(
            `Failed to list workflow runs: ${runsRes.status} ${await runsRes.text()}`,
          );
        }

        const runsData = await runsRes.json();
        const candidates = runsData.workflow_runs?.filter(
          (r: { path?: string; created_at: string }) =>
            r.path?.endsWith(workflowId) &&
            new Date(r.created_at).toISOString() >= triggerTime,
        ) ?? [];

        for (const c of candidates) {
          const jobsRes = await fetch(
            `https://api.github.com/repos/${repo}/actions/runs/${c.id}/jobs`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (jobsRes.ok) {
            const jobsData = await jobsRes.json();
            const matchedJob = jobsData.jobs.find((job: any) =>
              job.name?.includes(runUuid),
            );
            if (matchedJob) {
              runId = c.id;
              ctx.logger.info(`🆔 Matched run ID ${runId} via job name containing UUID=${runUuid}`);
              break;
            }
          }
        }

        if (runId) break;
        await new Promise(res => setTimeout(res, 5000));
      }

      if (!runId) throw new Error(
        `Workflow run for '${workflowId}' with UUID=${runUuid} not found after 60s.`,
      );

      // Step 3: Poll workflow status, log completed steps only
      const stepCache: Record<string, boolean> = {};

      while (true) {
        const runRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/runs/${runId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const runData = await runRes.json();

        const jobsRes = await fetch(
          `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          for (const job of jobsData.jobs) {
            const completedSteps = job.steps.filter(
              step =>
                step.status === 'completed' &&
                !stepCache[`${job.id}-${step.name}`],
            );

            for (const step of completedSteps) {
              ctx.logger.info(`✅ ${step.name} → ${step.conclusion}`);
              stepCache[`${job.id}-${step.name}`] = true;
            }
          }
        }

        if (runData.status === 'completed') break;
        await new Promise(res => setTimeout(res, 5000));
      }

      // Step 4: Final result
      const finalRes = await fetch(
        `https://api.github.com/repos/${repo}/actions/runs/${runId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const finalRun = await finalRes.json();

      if (finalRun.conclusion !== 'success') {
        throw new Error(`❌ Workflow '${workflowId}' failed: ${finalRun.conclusion}`);
      }

      ctx.logger.info(`🎉 Workflow completed successfully (UUID=${runUuid})`);
      ctx.output('workflowUrl', finalRun.html_url as string);
      ctx.output('runUuid', runUuid);
    },
  });
