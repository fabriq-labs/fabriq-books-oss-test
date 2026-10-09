import {
  SearchFilterValidationError,
  SearchQueryBuilder,
} from '../SearchQueryBuilder';

describe('SearchQueryBuilder field-type validation', () => {
  it('rejects contains on Decimal amount with a clear message', () => {
    expect(() =>
      SearchQueryBuilder.buildQueryOptions(
        {
          search: {
            filters: { amount: { contains: 'alex' } },
          },
        },
        'posting'
      )
    ).toThrow(SearchFilterValidationError);

    expect(() =>
      SearchQueryBuilder.buildQueryOptions(
        {
          search: {
            filters: { amount: { contains: 'alex' } },
          },
        },
        'posting'
      )
    ).toThrow(/Invalid filter: operator "contains" is not valid for field "amount" \(Decimal\)/);
  });

  it('rejects non-numeric eq on Decimal amount', () => {
    expect(() =>
      SearchQueryBuilder.buildQueryOptions(
        {
          search: {
            filters: { amount: { eq: 'alex' } },
          },
        },
        'posting'
      )
    ).toThrow(/Invalid filter: field "amount" is Decimal and cannot be filtered with non-numeric value/);
  });

  it('allows numeric comparison on amount', () => {
    const options = SearchQueryBuilder.buildQueryOptions(
      {
        search: {
          filters: { amount: { gte: '12.5' } },
        },
      },
      'posting'
    );
    expect(options.where).toEqual({ amount: { gte: '12.5' } });
  });

  it('allows contains on String description', () => {
    const options = SearchQueryBuilder.buildQueryOptions(
      {
        search: {
          filters: { description: { contains: 'alex' } },
        },
      },
      'posting'
    );
    expect(options.where).toEqual({
      description: { contains: 'alex', mode: 'insensitive' },
    });
  });

  it('appends id tiebreaker for non-unique sortOption (stable pagination)', () => {
    const options = SearchQueryBuilder.buildQueryOptions(
      {
        sortOption: { value_date: 'desc' },
        page: 2,
        pageSize: 10,
      },
      'posting'
    );
    expect(options.orderBy).toEqual([{ value_date: 'desc' }, { id: 'desc' }]);
    expect(options.skip).toBe(10);
    expect(options.take).toBe(10);
  });

  it('does not duplicate id when sortOption already includes id', () => {
    const options = SearchQueryBuilder.buildQueryOptions(
      {
        sortOption: { value_date: 'desc', id: 'desc' },
      },
      'posting'
    );
    expect(options.orderBy).toEqual([{ value_date: 'desc' }, { id: 'desc' }]);
  });

  it('accepts Prisma clause objects in sortOption arrays', () => {
    const options = SearchQueryBuilder.buildQueryOptions(
      {
        sortOption: [{ value_date: 'desc' }, { id: 'asc' }],
      },
      'posting'
    );
    expect(options.orderBy).toEqual([{ value_date: 'desc' }, { id: 'asc' }]);
  });
});
