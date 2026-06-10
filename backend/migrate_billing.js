const db = require('./src/infrastructure/database/db.client');

async function migrate() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS organizer_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'active',
                start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                end_date TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS billing_invoices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
                order_code VARCHAR(100) UNIQUE NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                payment_method VARCHAR(50),
                transaction_id VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log("Migration successful");
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}

migrate();
