import {
  formatMissingPromptTemplatesError,
  parsePromptTemplateFileSuffix,
} from '../../agent/prompt/promptTemplateFileMatch';

describe('parsePromptTemplateFileSuffix', () => {
  it('matches multi-underscore prompt types before app suffix', () => {
    expect(
      parsePromptTemplateFileSuffix('invoice_extractor_fabriq', ['invoice_extractor', 'default'])
    ).toEqual({ promptType: 'invoice_extractor', appNameFromFile: 'fabriq' });
  });

  it('matches prompt type with no app suffix', () => {
    expect(parsePromptTemplateFileSuffix('invoice_extractor', ['invoice_extractor'])).toEqual({
      promptType: 'invoice_extractor',
      appNameFromFile: null,
    });
  });

  it('prefers the longest matching requested type', () => {
    expect(
      parsePromptTemplateFileSuffix('invoice_extractor_fabriq_books', [
        'invoice',
        'invoice_extractor',
      ])
    ).toEqual({ promptType: 'invoice_extractor', appNameFromFile: 'fabriq_books' });
  });

  it('returns null when no requested type matches', () => {
    expect(parsePromptTemplateFileSuffix('default_fabriq', ['invoice_extractor'])).toBeNull();
  });
});

describe('formatMissingPromptTemplatesError', () => {
  it('includes model, view, types, and APP_NAME', () => {
    const msg = formatMissingPromptTemplatesError({
      modelName: 'invoice',
      viewName: 'invoice_view',
      promptTypes: ['invoice_extractor'],
      appName: 'fabriq_books',
    });
    expect(msg).toContain('model: invoice');
    expect(msg).toContain('view: invoice_view');
    expect(msg).toContain('invoice_extractor');
    expect(msg).toContain('APP_NAME=fabriq_books');
  });
});
