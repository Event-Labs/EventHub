const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// All routes require admin authorization
router.use(protect);
router.use(authorize('ADMIN'));

router.get('/', usersController.list);
router.get('/:id', usersController.getDetails);
router.post('/:id/lock', usersController.lock);
router.post('/:id/unlock', usersController.unlock);

module.exports = router;
