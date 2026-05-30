const express = require('express');
const eventCategoriesController = require('./eventCategories.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));

router.get('/', eventCategoriesController.list);
router.post('/', eventCategoriesController.create);
router.patch('/:id', eventCategoriesController.update);
router.delete('/:id', eventCategoriesController.delete);

module.exports = router;
