const eventCategoriesRepository = require('./eventCategories.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'loai-su-kien';
}

async function createUniqueSlug(name) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 2;

  while (await eventCategoriesRepository.slugExists(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

class EventCategoriesService {
  async listCategories() {
    return eventCategoriesRepository.findAll();
  }

  async createCategory(payload) {
    const slug = await createUniqueSlug(payload.name);
    return eventCategoriesRepository.create({
      name: payload.name,
      slug,
      description: payload.description,
      isActive: payload.is_active,
    });
  }

  async updateCategory(id, payload) {
    const category = await eventCategoriesRepository.findById(id);
    if (!category) {
      throw new AppError('Event category not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return eventCategoriesRepository.update(id, payload);
  }

  async deleteCategory(id) {
    const category = await eventCategoriesRepository.findById(id);
    if (!category) {
      throw new AppError('Event category not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    await eventCategoriesRepository.softDelete(id);
    return { id, deleted: true };
  }
}

module.exports = new EventCategoriesService();
