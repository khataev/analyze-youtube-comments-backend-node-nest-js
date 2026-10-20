import { describe, expect, it } from 'vitest';
import { Category } from '../../src/analysis/domain/category';
import { groupByCategory } from '../../src/analysis/domain/group-by-category';

const comments = [
  { id: 'a', text: 'Thank you!' },
  { id: 'b', text: 'How does it work?' },
  { id: 'c', text: 'Great video' },
];

describe('groupByCategory', () => {
  it('groups comments by category and takes text from the source', () => {
    const result = groupByCategory(comments, [
      { id: 'a', category: Category.Thanks, reasoning: '' },
      { id: 'b', category: Category.Questions, reasoning: '' },
      { id: 'c', category: Category.Thanks, reasoning: '' },
    ]);

    expect(result).toEqual({
      [Category.Thanks]: [
        { id: 'a', text: 'Thank you!' },
        { id: 'c', text: 'Great video' },
      ],
      [Category.Questions]: [{ id: 'b', text: 'How does it work?' }],
    });
  });

  it('drops ids invented by the model and duplicates', () => {
    const result = groupByCategory(comments, [
      { id: 'a', category: Category.Thanks, reasoning: '' },
      { id: 'a', category: Category.Bots, reasoning: '' },
      { id: 'zzz', category: Category.Bots, reasoning: '' },
    ]);

    expect(result).toEqual({ [Category.Thanks]: [{ id: 'a', text: 'Thank you!' }] });
  });

  it('omits empty categories', () => {
    expect(groupByCategory(comments, [])).toEqual({});
  });
});
