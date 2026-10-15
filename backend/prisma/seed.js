/**
 * Balemuya Seed Data
 * ══════════════════
 * Creates realistic Ethiopian demo data for development.
 *
 * Includes:
 * - 3 admin accounts
 * - 10 customers (Ethiopian names, Addis Ababa locations)
 * - 20 workers across various service categories
 * - 14 service categories
 * - Sample jobs, quotations, and reviews
 * - Platform settings
 *
 * Run: npm run db:seed
 *
 * ⚠️  All passwords are: Demo@1234 (except where noted)
 *     These are DEMO ACCOUNTS. Change credentials in production.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;
const DEMO_PASSWORD = 'Demo@1234';

// Ethiopian locations (Addis Ababa sub-cities with approximate coordinates)
const LOCATIONS = {
  'Bole': { lat: 9.0054, lng: 38.7636, city: 'Addis Ababa' },
  'Yeka': { lat: 9.0350, lng: 38.7864, city: 'Addis Ababa' },
  'Kirkos': { lat: 9.0065, lng: 38.7534, city: 'Addis Ababa' },
  'Arada': { lat: 9.0200, lng: 38.7468, city: 'Addis Ababa' },
  'Lideta': { lat: 9.0024, lng: 38.7305, city: 'Addis Ababa' },
  'Kolfe': { lat: 9.0135, lng: 38.7180, city: 'Addis Ababa' },
  'Nifas Silk': { lat: 8.9778, lng: 38.7671, city: 'Addis Ababa' },
  'Akaki': { lat: 8.8833, lng: 38.7833, city: 'Addis Ababa' },
  'Adama': { lat: 8.5400, lng: 39.2700, city: 'Adama' },
  'Hawassa': { lat: 7.0621, lng: 38.4762, city: 'Hawassa' },
};

const LOCATION_KEYS = Object.keys(LOCATIONS);
function randomLocation() {
  const key = LOCATION_KEYS[Math.floor(Math.random() * LOCATION_KEYS.length)];
  const loc = LOCATIONS[key];
  return { subCity: key, ...loc, lat: loc.lat + (Math.random() - 0.5) * 0.02, lng: loc.lng + (Math.random() - 0.5) * 0.02 };
}

const CATEGORIES = [
  { name: 'Plumbing', nameAm: 'የቧንቧ ጥገና', icon: '🔧', sortOrder: 1 },
  { name: 'Electrical', nameAm: 'ኤሌክትሪክ', icon: '⚡', sortOrder: 2 },
  { name: 'Cleaning', nameAm: 'ማጽጃ', icon: '🧹', sortOrder: 3 },
  { name: 'Construction', nameAm: 'ግንባታ', icon: '🏗️', sortOrder: 4 },
  { name: 'Home Maintenance', nameAm: 'የቤት ጥገና', icon: '🏠', sortOrder: 5 },
  { name: 'Satellite/TV Installation', nameAm: 'ሳተላይት ጭነት', icon: '📡', sortOrder: 6 },
  { name: 'Beauty', nameAm: 'ውበት', icon: '💄', sortOrder: 7 },
  { name: 'Painting', nameAm: 'ቀለም ቀቢ', icon: '🎨', sortOrder: 8 },
  { name: 'Carpentry', nameAm: 'አናፂ', icon: '🔨', sortOrder: 9 },
  { name: 'Appliance Repair', nameAm: 'የቤት ዕቃ ጥገና', icon: '🔩', sortOrder: 10 },
  { name: 'Electronics Repair', nameAm: 'ኤሌክትሮኒክስ ጥገና', icon: '📱', sortOrder: 11 },
  { name: 'Moving/Transport', nameAm: 'ዕቃ ማጓጓዝ', icon: '🚛', sortOrder: 12 },
  { name: 'Gardening', nameAm: 'ሣር ስራ', icon: '🌿', sortOrder: 13 },
  { name: 'Other', nameAm: 'ሌላ', icon: '⚙️', sortOrder: 14 },
];

const CUSTOMERS = [
  { fullName: 'Selamawit Tadesse', email: 'selamawit@demo.balemuya.et', phone: '+251911100001' },
  { fullName: 'Bereket Alemu', email: 'bereket@demo.balemuya.et', phone: '+251911100002' },
  { fullName: 'Tigist Haile', email: 'tigist@demo.balemuya.et', phone: '+251911100003' },
  { fullName: 'Yohannes Getachew', email: 'yohannes@demo.balemuya.et', phone: '+251911100004' },
  { fullName: 'Mekdes Solomon', email: 'mekdes@demo.balemuya.et', phone: '+251911100005' },
  { fullName: 'Dawit Bekele', email: 'dawit@demo.balemuya.et', phone: '+251911100006' },
  { fullName: 'Hiwot Girma', email: 'hiwot@demo.balemuya.et', phone: '+251911100007' },
  { fullName: 'Aklilu Tesfaye', email: 'aklilu@demo.balemuya.et', phone: '+251911100008' },
  { fullName: 'Bethlehem Mulugeta', email: 'bethlehem@demo.balemuya.et', phone: '+251911100009' },
  { fullName: 'Henok Abebe', email: 'henok@demo.balemuya.et', phone: '+251911100010' },
];

const WORKERS = [
  { fullName: 'Tesfaye Worku', email: 'tesfaye.worker@demo.balemuya.et', phone: '+251922200001', category: 'Plumbing', experience: 8, price: 500, rating: 4.8 },
  { fullName: 'Mulatu Sisay', email: 'mulatu.worker@demo.balemuya.et', phone: '+251922200002', category: 'Electrical', experience: 12, price: 800, rating: 4.9 },
  { fullName: 'Almaz Kebede', email: 'almaz.worker@demo.balemuya.et', phone: '+251922200003', category: 'Cleaning', experience: 5, price: 300, rating: 4.7 },
  { fullName: 'Girma Tadesse', email: 'girma.worker@demo.balemuya.et', phone: '+251922200004', category: 'Construction', experience: 15, price: 1200, rating: 4.6 },
  { fullName: 'Yeshi Hailu', email: 'yeshi.worker@demo.balemuya.et', phone: '+251922200005', category: 'Beauty', experience: 6, price: 400, rating: 4.9 },
  { fullName: 'Abebe Gemechu', email: 'abebe.worker@demo.balemuya.et', phone: '+251922200006', category: 'Painting', experience: 10, price: 600, rating: 4.5 },
  { fullName: 'Frehiwot Desta', email: 'frehiwot.worker@demo.balemuya.et', phone: '+251922200007', category: 'Carpentry', experience: 9, price: 700, rating: 4.7 },
  { fullName: 'Solomon Bekele', email: 'solomon.worker@demo.balemuya.et', phone: '+251922200008', category: 'Appliance Repair', experience: 7, price: 450, rating: 4.4 },
  { fullName: 'Meseret Alemu', email: 'meseret.worker@demo.balemuya.et', phone: '+251922200009', category: 'Cleaning', experience: 4, price: 280, rating: 4.6 },
  { fullName: 'Zerihun Haile', email: 'zerihun.worker@demo.balemuya.et', phone: '+251922200010', category: 'Electronics Repair', experience: 11, price: 650, rating: 4.8 },
  { fullName: 'Tigist Wonde', email: 'tigist.worker@demo.balemuya.et', phone: '+251922200011', category: 'Satellite/TV Installation', experience: 5, price: 500, rating: 4.3 },
  { fullName: 'Kassahun Mekonnen', email: 'kassahun.worker@demo.balemuya.et', phone: '+251922200012', category: 'Moving/Transport', experience: 8, price: 900, rating: 4.5 },
  { fullName: 'Yonas Lemma', email: 'yonas.worker@demo.balemuya.et', phone: '+251922200013', category: 'Plumbing', experience: 6, price: 550, rating: 4.7 },
  { fullName: 'Aster Teshome', email: 'aster.worker@demo.balemuya.et', phone: '+251922200014', category: 'Gardening', experience: 3, price: 250, rating: 4.2 },
  { fullName: 'Biruk Assefa', email: 'biruk.worker@demo.balemuya.et', phone: '+251922200015', category: 'Electrical', experience: 9, price: 750, rating: 4.6 },
  { fullName: 'Nardos Girma', email: 'nardos.worker@demo.balemuya.et', phone: '+251922200016', category: 'Home Maintenance', experience: 7, price: 600, rating: 4.8 },
  { fullName: 'Habtamu Tesfaye', email: 'habtamu.worker@demo.balemuya.et', phone: '+251922200017', category: 'Construction', experience: 20, price: 1500, rating: 4.9 },
  { fullName: 'Lidya Kebede', email: 'lidya.worker@demo.balemuya.et', phone: '+251922200018', category: 'Beauty', experience: 8, price: 350, rating: 4.8 },
  { fullName: 'Dawit Mekonnen', email: 'dawit.worker@demo.balemuya.et', phone: '+251922200019', category: 'Carpentry', experience: 14, price: 800, rating: 4.7 },
  { fullName: 'Meron Berhane', email: 'meron.worker@demo.balemuya.et', phone: '+251922200020', category: 'Appliance Repair', experience: 5, price: 400, rating: 4.5 },
];

async function main() {
  console.log('🌱 Starting Balemuya seed...');

  // Clear existing data in correct order
  console.log('🗑️  Clearing existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.review.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.report.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.jobImage.deleteMany();
  await prisma.job.deleteMany();
  await prisma.portfolioImage.deleteMany();
  await prisma.workerCategory.deleteMany();
  await prisma.workerSkill.deleteMany();
  await prisma.workerProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.block.deleteMany();
  await prisma.user.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.platformSetting.deleteMany();

  const hash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  // 1. Service Categories
  console.log('📂 Creating service categories...');
  const categories = {};
  for (const cat of CATEGORIES) {
    const created = await prisma.serviceCategory.create({ data: cat });
    categories[cat.name] = created;
  }

  // 2. Admin accounts
  console.log('👤 Creating admin accounts...');
  const admins = [
    { fullName: 'Balemuya Admin', email: 'admin@balemuya.et', phone: '+251900000001' },
    { fullName: 'Kebede Adminstrator', email: 'admin2@balemuya.et', phone: '+251900000002' },
    { fullName: 'Konjit Supervisor', email: 'supervisor@balemuya.et', phone: '+251900000003' },
  ];

  for (const admin of admins) {
    const loc = randomLocation();
    await prisma.user.create({
      data: {
        ...admin,
        passwordHash: hash,
        role: 'ADMIN',
        isVerified: true,
        city: 'Addis Ababa',
        latitude: loc.lat,
        longitude: loc.lng,
      },
    });
  }

  // 3. Customer accounts
  console.log('👥 Creating customer accounts...');
  const customerProfiles = [];
  for (const customer of CUSTOMERS) {
    const loc = randomLocation();
    const user = await prisma.user.create({
      data: {
        ...customer,
        passwordHash: hash,
        role: 'CUSTOMER',
        city: loc.city,
        latitude: loc.lat,
        longitude: loc.lng,
        customerProfile: { create: {} },
      },
      include: { customerProfile: true },
    });
    customerProfiles.push(user);
  }

  // 4. Worker accounts
  console.log('👷 Creating worker accounts...');
  const workerProfiles = [];
  for (const worker of WORKERS) {
    const loc = randomLocation();
    const category = categories[worker.category];
    const skills = getSkillsForCategory(worker.category);

    // Create skills
    const skillRecords = await Promise.all(
      skills.map((name) => prisma.skill.upsert({ where: { name }, update: {}, create: { name } }))
    );

    const user = await prisma.user.create({
      data: {
        fullName: worker.fullName,
        email: worker.email,
        phone: worker.phone,
        passwordHash: hash,
        role: 'WORKER',
        isVerified: true,
        city: loc.city,
        latitude: loc.lat,
        longitude: loc.lng,
        workerProfile: {
          create: {
            bio: generateBio(worker.fullName, worker.category, worker.experience),
            experience: worker.experience,
            startingPrice: worker.price,
            availability: Math.random() > 0.2 ? 'AVAILABLE' : 'BUSY',
            city: loc.city,
            subCity: loc.subCity,
            serviceArea: `${loc.subCity} and surrounding areas`,
            serviceRadius: 10 + Math.random() * 20,
            latitude: loc.lat,
            longitude: loc.lng,
            verificationStatus: Math.random() > 0.3 ? 'VERIFIED' : 'PENDING',
            completedJobs: Math.floor(Math.random() * 50) + 5,
            averageRating: worker.rating,
            profileCompletion: Math.floor(70 + Math.random() * 30),
            categories: { create: [{ categoryId: category.id }] },
            skills: { create: skillRecords.map((s) => ({ skillId: s.id })) },
          },
        },
      },
      include: { workerProfile: true },
    });
    workerProfiles.push(user);
  }

  // 5. Sample jobs
  console.log('💼 Creating sample jobs...');
  const SAMPLE_JOBS = [
    { title: 'Fix leaking kitchen sink pipe', category: 'Plumbing', description: 'There is water leaking under the kitchen sink. The pipe connection seems loose and needs to be tightened or replaced.', location: 'Bole, Addis Ababa', budget: 800, urgency: 'HIGH', status: 'COMPLETED' },
    { title: 'House rewiring — 3 bedrooms', category: 'Electrical', description: 'Need complete rewiring of my 3-bedroom house. Old wiring is causing frequent power cuts and safety concerns.', location: 'Yeka, Addis Ababa', budget: 15000, urgency: 'MEDIUM', status: 'IN_PROGRESS' },
    { title: 'Deep cleaning of 4-room apartment', category: 'Cleaning', description: 'Need thorough cleaning of apartment after moving out. Includes windows, floors, bathrooms, and kitchen.', location: 'Kirkos, Addis Ababa', budget: 1200, urgency: 'LOW', status: 'PAID' },
    { title: 'Satellite dish installation', category: 'Satellite/TV Installation', description: 'Install a new satellite dish and configure for DSTV. Apartment is on 3rd floor.', location: 'Arada, Addis Ababa', budget: 1500, urgency: 'MEDIUM', status: 'POSTED' },
    { title: 'Paint 2 bedroom house interior', category: 'Painting', description: 'Interior painting for 2 bedroom house. Walls only, not ceiling. Approximately 80 sqm total area.', location: 'Lideta, Addis Ababa', budget: 4000, urgency: 'LOW', status: 'QUOTATIONS_RECEIVED' },
    { title: 'Built-in wardrobe — master bedroom', category: 'Carpentry', description: 'Custom built-in wardrobe for master bedroom. Approximately 3m x 2.5m. Need design consultation.', location: 'Bole, Addis Ababa', budget: 8000, urgency: 'MEDIUM', status: 'WORKER_SELECTED' },
    { title: 'Refrigerator not cooling — repair needed', category: 'Appliance Repair', description: 'Samsung refrigerator (model RT25) stopped cooling. Compressor making noise. Need diagnosis and repair.', location: 'Kolfe, Addis Ababa', budget: 2000, urgency: 'HIGH', status: 'POSTED' },
    { title: 'Garden design and planting', category: 'Gardening', description: 'Design and plant a small garden in front of house. Area is approximately 20 sqm. Want Ethiopian plants and flowers.', location: 'Nifas Silk, Addis Ababa', budget: 3000, urgency: 'LOW', status: 'POSTED' },
    { title: 'Smartphone screen replacement', category: 'Electronics Repair', description: 'iPhone 13 screen cracked. Need professional screen replacement. Original parts preferred.', location: 'Bole, Addis Ababa', budget: 2500, urgency: 'MEDIUM', status: 'COMPLETED' },
    { title: 'Move furniture to new apartment', category: 'Moving/Transport', description: 'Moving from 2-bedroom apartment in Bole to new apartment in Yeka. 3rd floor to 2nd floor. Need truck and 3 people.', location: 'Bole, Addis Ababa', budget: 2000, urgency: 'HIGH', status: 'PAID' },
  ];

  const createdJobs = [];
  for (let i = 0; i < SAMPLE_JOBS.length; i++) {
    const jobData = SAMPLE_JOBS[i];
    const customer = customerProfiles[i % customerProfiles.length];
    const loc = randomLocation();
    const category = categories[jobData.category];

    const job = await prisma.job.create({
      data: {
        title: jobData.title,
        categoryId: category.id,
        description: jobData.description,
        location: jobData.location,
        latitude: loc.lat,
        longitude: loc.lng,
        city: loc.city,
        area: loc.subCity,
        budget: jobData.budget,
        urgency: jobData.urgency,
        status: jobData.status,
        customerProfileId: customer.customerProfile.id,
        preferredDate: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    createdJobs.push(job);
  }

  // 6. Sample quotations
  console.log('📋 Creating sample quotations...');
  const postedJobs = createdJobs.filter(j => ['POSTED', 'QUOTATIONS_RECEIVED'].includes(j.status));
  for (const job of postedJobs) {
    const applicableWorkers = workerProfiles.slice(0, 3);
    for (const worker of applicableWorkers) {
      try {
        await prisma.quotation.create({
          data: {
            jobId: job.id,
            workerProfileId: worker.workerProfile.id,
            price: (job.budget || 1000) * (0.8 + Math.random() * 0.4),
            estimatedTime: `${Math.floor(1 + Math.random() * 5)} days`,
            message: `Hello, I am experienced in this type of work and can complete your job professionally and on time. I have ${WORKERS[workerProfiles.indexOf(worker)]?.experience || 5} years of experience.`,
            status: 'PENDING',
          },
        });
      } catch (e) { /* skip duplicates */ }
    }
  }

  // 7. Sample reviews for completed/paid jobs
  console.log('⭐ Creating sample reviews...');
  const completedJobs = createdJobs.filter(j => ['COMPLETED', 'PAID', 'REVIEWED'].includes(j.status));
  for (const job of completedJobs) {
    const workerProfile = workerProfiles[0].workerProfile;
    // Update job with selected worker first
    await prisma.job.update({ where: { id: job.id }, data: { selectedWorkerId: workerProfile.id } });
    try {
      await prisma.review.create({
        data: {
          jobId: job.id,
          workerProfileId: workerProfile.id,
          rating: 4 + Math.floor(Math.random() * 2),
          comment: getRandomReview(),
        },
      });
    } catch (e) { /* skip if duplicate */ }
  }

  // 8. Platform settings
  console.log('⚙️  Creating platform settings...');
  await prisma.platformSetting.createMany({
    data: [
      { key: 'commission_rate', value: '10', label: 'Commission Rate (%)', description: 'Platform commission percentage taken from each completed job payment.' },
      { key: 'max_quotations_per_job', value: '10', label: 'Max Quotations per Job', description: 'Maximum number of worker quotations allowed per job.' },
      { key: 'platform_name', value: 'Balemuya', label: 'Platform Name', description: 'The name of the platform.' },
      { key: 'support_email', value: 'support@balemuya.et', label: 'Support Email', description: 'Customer support email address.' },
      { key: 'support_phone', value: '+251911000000', label: 'Support Phone', description: 'Customer support phone number.' },
    ],
  });

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Categories: ${CATEGORIES.length}`);
  console.log(`   Admins: 3 (password: ${DEMO_PASSWORD})`);
  console.log(`   Customers: ${CUSTOMERS.length}`);
  console.log(`   Workers: ${WORKERS.length}`);
  console.log(`   Jobs: ${SAMPLE_JOBS.length}`);
  console.log('\n🔑 Demo Admin Login:');
  console.log('   Email: admin@balemuya.et');
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log('\n🔑 Demo Customer Login:');
  console.log('   Email: selamawit@demo.balemuya.et');
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log('\n🔑 Demo Worker Login:');
  console.log('   Email: tesfaye.worker@demo.balemuya.et');
  console.log(`   Password: ${DEMO_PASSWORD}`);
}

function getSkillsForCategory(category) {
  const skillMap = {
    'Plumbing': ['Pipe installation', 'Leak repair', 'Drainage', 'Water heater'],
    'Electrical': ['Wiring', 'Circuit breaker', 'CCTV installation', 'Solar installation'],
    'Cleaning': ['Deep cleaning', 'Carpet cleaning', 'Window cleaning', 'Post-construction cleaning'],
    'Construction': ['Masonry', 'Foundation work', 'Concrete work', 'Tiling'],
    'Home Maintenance': ['General repairs', 'Door/window repair', 'Gutter cleaning'],
    'Satellite/TV Installation': ['DSTV', 'Ethio Telecom', 'Antenna installation'],
    'Beauty': ['Haircut', 'Braiding', 'Makeup', 'Manicure'],
    'Painting': ['Interior painting', 'Exterior painting', 'Decorative painting'],
    'Carpentry': ['Furniture making', 'Cabinet installation', 'Flooring'],
    'Appliance Repair': ['Refrigerator repair', 'Washing machine repair', 'Oven repair'],
    'Electronics Repair': ['Phone repair', 'Laptop repair', 'TV repair'],
    'Moving/Transport': ['House moving', 'Office relocation', 'Furniture delivery'],
    'Gardening': ['Lawn care', 'Tree pruning', 'Landscaping', 'Plant care'],
    'Other': ['General services'],
  };
  return skillMap[category] || ['General services'];
}

function generateBio(name, category, experience) {
  return `Professional ${category.toLowerCase()} specialist with ${experience} years of experience in Addis Ababa. I am committed to quality work, punctuality, and customer satisfaction. Available for residential and commercial projects. Contact me for a free consultation.`;
}

function getRandomReview() {
  const reviews = [
    'Excellent work! Very professional and completed the job on time.',
    'Great service! The worker was skilled and friendly. Highly recommended.',
    'Good work, arrived on time and did a clean job. Will hire again.',
    'Very satisfied with the quality of work. Fair price and professional.',
    'Outstanding service! Went above and beyond to make sure everything was perfect.',
    'Reliable and skilled. The job was done perfectly. Thank you!',
  ];
  return reviews[Math.floor(Math.random() * reviews.length)];
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
