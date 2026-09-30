const {
  extractImagesFromHtml,
  collectAllEventImages,
} = require('../../src/common/utils/htmlImageParser.util');

describe('htmlImageParser Utility', () => {
  describe('extractImagesFromHtml', () => {
    it('should return an empty array if html is empty or not string', () => {
      expect(extractImagesFromHtml('')).toEqual([]);
      expect(extractImagesFromHtml(null)).toEqual([]);
      expect(extractImagesFromHtml(undefined)).toEqual([]);
    });

    it('should extract single and multiple <img> tags with single/double quotes', () => {
      const html = `
        <p>Sự kiện hấp dẫn</p>
        <img src="https://example.com/poster1.jpg" alt="Poster 1" />
        <div>
          <img class="img-fluid" src='https://example.com/poster2.png'>
        </div>
      `;
      const result = extractImagesFromHtml(html);
      expect(result).toEqual([
        'https://example.com/poster1.jpg',
        'https://example.com/poster2.png',
      ]);
    });

    it('should extract base64 data URIs from <img> tags', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />';
      const result = extractImagesFromHtml(html);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('data:image/png;base64,');
    });

    it('should deduplicate repeating images', () => {
      const html = `
        <img src="https://example.com/same.jpg" />
        <p>Text</p>
        <img src="https://example.com/same.jpg" />
      `;
      const result = extractImagesFromHtml(html);
      expect(result).toEqual(['https://example.com/same.jpg']);
    });
  });

  describe('collectAllEventImages', () => {
    it('should combine thumbnail, banner, and HTML description images without duplicates', () => {
      const eventData = {
        thumbnail_url: 'https://cdn.eventhub.vn/thumb.jpg',
        banner_url: 'https://cdn.eventhub.vn/banner.jpg',
        description: '<p>Chi tiết</p><img src="https://cdn.eventhub.vn/thumb.jpg"><img src="https://cdn.eventhub.vn/inline1.jpg">',
        short_description: '<img src="https://cdn.eventhub.vn/inline2.png">',
      };

      const collected = collectAllEventImages(eventData);

      expect(collected).toEqual([
        {
          source: 'MAIN_POSTER',
          url: 'https://cdn.eventhub.vn/thumb.jpg',
          isBase64: false,
        },
        {
          source: 'COVER_BANNER',
          url: 'https://cdn.eventhub.vn/banner.jpg',
          isBase64: false,
        },
        {
          source: 'DESCRIPTION_IMAGE_2',
          url: 'https://cdn.eventhub.vn/inline1.jpg',
          isBase64: false,
        },
        {
          source: 'DESCRIPTION_IMAGE_3',
          url: 'https://cdn.eventhub.vn/inline2.png',
          isBase64: false,
        },
      ]);
    });
  });
});
