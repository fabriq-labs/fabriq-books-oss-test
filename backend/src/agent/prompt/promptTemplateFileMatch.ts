/**
 * Helpers for matching prompt-template filenames:
 *   view_{view_id}_{prompt_type}[_{app_name}].json
 *
 * prompt_type may contain underscores (e.g. invoice_extractor).
 */

export function parsePromptTemplateFileSuffix(
  suffix: string,
  requestedTypes: string[]
): { promptType: string; appNameFromFile: string | null } | null {
  const normalizedSuffix = suffix.replace(/-/g, '_');
  const sortedTypes = [...requestedTypes]
    .map((t) => ({ original: t, normalized: t.replace(/-/g, '_') }))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  for (const { original, normalized } of sortedTypes) {
    if (normalizedSuffix === normalized) {
      return { promptType: original, appNameFromFile: null };
    }
    if (normalizedSuffix.startsWith(`${normalized}_`)) {
      const rest = normalizedSuffix.slice(normalized.length + 1);
      return {
        promptType: original,
        appNameFromFile: rest.length > 0 ? rest : null,
      };
    }
  }
  return null;
}

export function formatMissingPromptTemplatesError(args: {
  modelName: string;
  viewName: string;
  promptTypes?: string[];
  appName?: string | null;
}): string {
  const types = (args.promptTypes?.length ? args.promptTypes : ['default']).join(', ');
  const app = args.appName ? `APP_NAME=${args.appName}` : 'APP_NAME=(unset)';
  return (
    `No prompt templates found for model: ${args.modelName}, view: ${args.viewName}, ` +
    `types: ${types} (${app}). ` +
    `Ensure prompt_template rows exist for this view/type and app_name matches ${app} ` +
    `(or unset APP_NAME).`
  );
}
