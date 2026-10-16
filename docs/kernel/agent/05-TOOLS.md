# Agent tools

The catalog the Super Admin UI shows is `AGENT_TOOL_CATALOG` in `backend/src/agent/toolRegistry.ts`. Per-model assignment is `agent_model_tool_config.model_tools`. Session tools are added by `ToolManager` on top of that list.

## Catalog

| Name | Category | What it does |
|---|---|---|
| `searchRecords` | search | Search any model through the metadata API |
| `createRecord` | crud | Create a row |
| `updateRecord` | crud | Update a row |
| `createChildItem` | crud | Add a child on a relation |
| `updateChildItem` | crud | Update a child |
| `searchUsers` | search | Search `user` |
| `advancedSqlQuery` | analytics | SQL that must include the caller org on tenant tables |
| `getAnalyticsContext` | analytics | Schema context for a later query |
| `analyticsQuery` | analytics | Run that query |
| `queueActions` | session | Insert `pending_action` rows for a person to approve |
| `requestClarification` | session | Pause for an answer |

`createPlan` and `completeStep` are session tools injected with those two. They are not rows in the checkbox catalog.

`GenericFunctions.ts` still lists search helpers whose models are not in this schema. They are not in `AGENT_TOOL_CATALOG`. Do not treat them as kernel tools.

## Supervised mode

`agent_session.mode` defaults to `supervised`. The other stored values are `semi_auto` and `autonomous`.

`withoutMutatingTools` in `ToolManager.ts` runs when mode is `supervised`. It removes `createRecord`, `updateRecord`, `createChildItem`, and `updateChildItem`. `queueActions` stays. The prompt text is not the control. A supervised turn cannot call those four tools because they are not on the tool object.

Writes the user accepts go through pending-action resolution, which checks `pending_action.org_id` against the caller.
