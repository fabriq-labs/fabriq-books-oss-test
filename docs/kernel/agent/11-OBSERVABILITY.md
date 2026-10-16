# Observability

Every agent model call is logged by `llmTraceLogger.logTrace()` after the response. A logging failure does not fail the user request. Code: `backend/src/lib/llm-trace-logger.ts`. The shell list is `/settings/llm-traces`.

`llm_trace` stores `org_id`, `user_id`, `session_id`, `question`, `llm_model`, token counts, `duration_ms`, `tools_called`, `response_text`, `status`, and `error_message`. Cache columns (`cached_prompt_tokens`, `cache_creation_tokens`) and `cost_usd` are null when the provider does not report them.

`llm_trace_step` stores one row per step: `step_number`, token counts, `tool_calls`, `tool_results`, and `sql_queries` when the step ran analytics SQL. `(trace_id, step_number)` is unique.

`org_id` is required. A trace from another org is not listed for the caller.

`ai_activity_log` is a separate required-`org_id` table for activity rows. It is not the session transcript. The transcript is `agent_message` and, for the chat panel, `chat_thread`.
