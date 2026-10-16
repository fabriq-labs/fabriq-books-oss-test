# Prompt system

There is no single prompt string. `AgentService` assembles one from layers at request time. Code: `backend/src/agent/prompt/DynamicPromptManager.ts` and `prompt/constants.ts`.

```
Final system prompt =
  agent_template.system_prompt     (sessions that have a template)
  + merged prompt_template rows    (every call)
  + SESSION_DIRECTIVE              (sessions)
  + session state block            (sessions; changes every turn)
```

The static directive is placed before the dynamic state block so the prefix can stay stable across turns.

## Two template tables

| | `agent_template` | `prompt_template` |
|---|---|---|
| Purpose | Task instructions, `allowed_tools`, `focus_models` | Reusable prompt fragments merged into the base prompt |
| Loaded | When the session has `template_id` | Every LLM call |
| Edited in the shell | `/settings/ai-templates` | Prompt templates on that page |
| If absent | The session still runs, without that brief | `DynamicPromptManager` fails the call when it finds no rows |

`prompt_template` is shareable: caller org or `org_system`. Admin template writes under `/api/agent/admin/templates` require a platform admin.

`allowed_tools` on `agent_template` is a ceiling on the tool set. Supervised mode still removes the mutating tools after that filter. See [05-TOOLS.md](./05-TOOLS.md).

`focus_models` limits which model schemas are interpolated into the base prompt. An empty list does not mean "no models". The manager falls back to its own related-model list.

## Session state block

On a session turn the dynamic block includes the goal, mode, status, plan, pending-action count, and `accumulated_context`. The shape is in [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md).

A non-session chat call uses the merged `prompt_template` rows and does not add the session directive or the state block.
