const express = require('express');
const promotionsController = require('./promotions.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect); // All promotion routes for organizer require authentication

router.get('/', promotionsController.getPromos);
router.get('/:id', promotionsController.getPromoDetail);
router.post('/', promotionsController.createPromo);
router.put('/:id', promotionsController.updatePromo);
router.delete('/:id', promotionsController.deactivatePromo);

module.exports = router;
