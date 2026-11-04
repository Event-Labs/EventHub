const { z } = require('zod');

const CCCD_PROVINCE_CODES = new Set([
  '001', '002', '004', '006', '008', '010', '011', '012', '014', '015',
  '017', '019', '020', '022', '024', '025', '026', '027', '030', '031',
  '033', '034', '035', '036', '037', '038', '040', '042', '044', '045',
  '046', '048', '049', '051', '052', '054', '056', '058', '060', '062',
  '064', '066', '067', '068', '070', '072', '074', '075', '077', '079',
  '080', '082', '083', '084', '086', '087', '089', '091', '092', '093',
  '094', '095', '096'
]);

function validateCccdStructure(idNumber, dob = '', gender = '') {
  if (!idNumber || !/^\d{12}$/.test(idNumber)) {
    return 'Số CCCD phải bao gồm đúng 12 chữ số theo quy chuẩn Bộ Công An.';
  }
  const province = idNumber.slice(0, 3);
  if (!CCCD_PROVINCE_CODES.has(province)) {
    return `Mã tỉnh/thành phố '${province}' không tồn tại trong danh mục 63 tỉnh/thành của Bộ Công An.`;
  }

  const genderDigit = parseInt(idNumber.charAt(3), 10);
  if (![0, 1, 2, 3].includes(genderDigit)) {
    return `Chữ số thứ 4 ('${genderDigit}') không hợp lệ. Quy chuẩn C06 chỉ chấp nhận 0-1 (thế kỷ 20) hoặc 2-3 (thế kỷ 21).`;
  }

  const century = genderDigit === 0 || genderDigit === 1 ? 1900 : 2000;
  const cccdGender = genderDigit === 0 || genderDigit === 2 ? 'Nam' : 'Nữ';
  const yearSuffix = parseInt(idNumber.slice(4, 6), 10);
  const cccdBirthYear = century + yearSuffix;
  const currentYear = new Date().getFullYear();

  if (cccdBirthYear > currentYear - 15) {
    return `Năm sinh trích xuất từ CCCD (${cccdBirthYear}) chưa đủ tuổi đại diện tổ chức sự kiện.`;
  }
  if (cccdBirthYear < 1920) {
    return `Năm sinh trích xuất từ CCCD (${cccdBirthYear}) không hợp lệ.`;
  }

  const randomPart = idNumber.slice(6);
  if (randomPart === '000000') {
    return 'Dãy 6 số cuối CCCD không hợp lệ (kho số Bộ Công An bắt đầu từ 000001).';
  }

  if (dob) {
    let year = null;
    const parts = dob.includes('/') ? dob.split('/') : dob.includes('-') ? dob.split('-') : null;
    if (parts) {
      if (parts[2]?.length === 4) year = parseInt(parts[2], 10);
      else if (parts[0]?.length === 4) year = parseInt(parts[0], 10);
    }

    if (year && !isNaN(year) && year !== cccdBirthYear) {
      return `Năm sinh khai báo (${year}) không khớp với năm sinh trích xuất từ CCCD (${cccdBirthYear}).`;
    }
  }

  if (gender) {
    const isMale = gender.toLowerCase().includes('nam') || gender.toLowerCase() === 'm';
    const isFemale = gender.toLowerCase().includes('nữ') || gender.toLowerCase() === 'f';
    const selectedGender = isMale ? 'Nam' : isFemale ? 'Nữ' : gender;

    if (selectedGender !== cccdGender) {
      return `Giới tính chọn (${selectedGender}) không khớp với chữ số giới tính trong CCCD (${cccdGender}).`;
    }
  }

  return null;
}

const requestIdSchema = z.object({
  id: z.string().uuid(),
});

const verifyOrganizerBusinessEmailSchema = z.object({
  token: z.string().trim().min(20),
});

const optionalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .optional()
  .or(z.literal(''));

const submitOrganizerRequestSchema = z.object({
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).default('INDIVIDUAL'),
  organization_name: z.string().trim().min(2).max(255),
  organization_description: z.string().trim().min(10).max(5000),
  business_email: z
    .string()
    .trim()
    .email()
    .max(255)
    .optional()
    .or(z.literal('')),
  business_phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Invalid Vietnamese phone number'),
  organization_avatar_url: optionalUrlSchema,
  tax_code: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13})$/, 'Invalid Vietnamese tax code')
    .optional()
    .or(z.literal('')),
  legal_document_url: optionalUrlSchema,
  business_license_url: optionalUrlSchema,
  legal_representative_name: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_position: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_id_url: optionalUrlSchema,
  authorization_letter_url: optionalUrlSchema,
  individual_full_name: z.string().trim().max(255).optional().or(z.literal('')),
  individual_identity_number: z
    .string()
    .trim()
    .regex(/^(\d{9}|\d{12}|[A-Z0-9]{6,20})$/, 'Invalid identity document number')
    .optional()
    .or(z.literal('')),
  individual_id_front_url: optionalUrlSchema,
  individual_id_back_url: optionalUrlSchema,
  individual_selfie_url: optionalUrlSchema,
  individual_tax_code: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13})$/, 'Invalid personal tax code')
    .optional()
    .or(z.literal('')),
  kyc_ocr_data: z.any().optional(),
  terms_accepted: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (!data.terms_accepted) {
    ctx.addIssue({
      code: 'custom',
      message: 'Organizer terms must be accepted',
      path: ['terms_accepted'],
    });
  }

  if (!data.organization_avatar_url?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Organizer avatar is required',
      path: ['organization_avatar_url'],
    });
  }

  if (data.request_type === 'INDIVIDUAL') {
    if (!data.individual_full_name?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Legal full name is required for individual requests',
        path: ['individual_full_name'],
      });
    } else if (data.individual_full_name.trim() !== data.individual_full_name.trim().toLocaleUpperCase('vi-VN')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Legal full name must be uppercase and match the identity document',
        path: ['individual_full_name'],
      });
    }

    [
      ['individual_identity_number', 'Identity document number is required for individual requests'],
      ['individual_selfie_url', 'Portrait/Selfie photo is required for individual requests'],
    ].forEach(([field, message]) => {
      if (!data[field]?.trim()) {
        ctx.addIssue({ code: 'custom', message, path: [field] });
      }
    });

    if (data.individual_identity_number) {
      const dob = data.kyc_ocr_data?.dob || '';
      const gender = data.kyc_ocr_data?.gender || '';
      const cccdError = validateCccdStructure(data.individual_identity_number.trim(), dob, gender);
      if (cccdError) {
        ctx.addIssue({
          code: 'custom',
          message: cccdError,
          path: ['individual_identity_number'],
        });
      }
    }

    // Consistency check: Ensure form data matches kyc_ocr_data
    if (data.kyc_ocr_data && typeof data.kyc_ocr_data === 'object') {
      const kycId = String(data.kyc_ocr_data.id_number || '').trim();
      const formId = String(data.individual_identity_number || '').trim();
      if (kycId && formId && kycId !== formId) {
        ctx.addIssue({
          code: 'custom',
          message: 'Số CCCD không trùng khớp với hồ sơ thẩm định',
          path: ['individual_identity_number'],
        });
      }

      const kycName = String(data.kyc_ocr_data.full_name || '').trim().toUpperCase();
      const formName = String(data.individual_full_name || '').trim().toUpperCase();
      if (kycName && formName && kycName !== formName) {
        ctx.addIssue({
          code: 'custom',
          message: 'Họ và tên không trùng khớp với hồ sơ thẩm định',
          path: ['individual_full_name'],
        });
      }
    }

    return;
  }

  if (!data.business_email?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Business email is required for organization requests',
      path: ['business_email'],
    });
  }

  [
    ['tax_code', 'Tax code is required for organization requests'],
    ['legal_document_url', 'Legal document is required for organization requests'],
    ['legal_representative_name', 'Legal representative name is required for organization requests'],
    ['legal_representative_position', 'Legal representative position is required for organization requests'],
    ['legal_representative_id_url', 'Legal representative ID document is required for organization requests'],
  ].forEach(([field, message]) => {
    if (!data[field]?.trim()) {
      ctx.addIssue({ code: 'custom', message, path: [field] });
    }
  });
});

const organizerProfileUpdateSchema = z.object({
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  tax_code: z.string().trim().max(30).optional().or(z.literal('')),
  legal_document_url: optionalUrlSchema,
  business_license_url: optionalUrlSchema,
  legal_representative_name: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_position: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_id_url: optionalUrlSchema,
  authorization_letter_url: optionalUrlSchema,
  individual_full_name: z.string().trim().max(255).optional().or(z.literal('')),
  individual_identity_number: z.string().trim().max(50).optional().or(z.literal('')),
  individual_id_front_url: optionalUrlSchema,
  individual_id_back_url: optionalUrlSchema,
  individual_selfie_url: optionalUrlSchema,
  individual_tax_code: z.string().trim().max(30).optional().or(z.literal('')),
  kyc_ocr_data: z.any().optional(),
});

const listOrganizerRequestsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
});

const reviewOrganizerRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    review_note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.review_note?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Review note is required when rejecting a request',
        path: ['review_note'],
      });
    }
  });

module.exports = {
  requestIdSchema,
  verifyOrganizerBusinessEmailSchema,
  submitOrganizerRequestSchema,
  organizerProfileUpdateSchema,
  listOrganizerRequestsSchema,
  reviewOrganizerRequestSchema,
};
