/**
 * Lua Scripts for Atomic Virtual Waiting Room operations
 */

const LUA_SCRIPTS = {
  /**
   * ATOMIC JOIN OR ADMIT
   * KEYS[1]: queue:event:{eventId} (ZSET)
   * KEYS[2]: active:event:{eventId} (HASH: sessionId -> json/expiry)
   * KEYS[3]: active:expiry:{eventId} (ZSET: score=expires_at, member=sessionId)
   * KEYS[4]: queue:meta:{eventId} (HASH)
   * ARGV[1]: sessionId (string)
   * ARGV[2]: now_ms (integer)
   * ARGV[3]: max_active (integer)
   * ARGV[4]: session_duration_ms (integer)
   * 
   * Returns:
   * [1] = status ("ADMITTED" or "QUEUED" or "PAUSED" or "SOLD_OUT")
   * [2] = position (integer, 0 if admitted, 0-based rank if queued)
   * [3] = active_count (integer)
   * [4] = queue_length (integer)
   * [5] = expires_at (integer, for admitted)
   */
  JOIN_OR_ADMIT: `
    local queueKey = KEYS[1]
    local activeKey = KEYS[2]
    local expiryKey = KEYS[3]
    local metaKey = KEYS[4]

    local sessionId = ARGV[1]
    local nowMs = tonumber(ARGV[2])
    local maxActive = tonumber(ARGV[3])
    local durationMs = tonumber(ARGV[4])

    -- Check if queue is paused or sold out
    local isPaused = redis.call('HGET', metaKey, 'is_paused')
    if isPaused == '1' or isPaused == 'true' then
      return {'PAUSED', 0, 0, 0, 0}
    end

    local isSoldOut = redis.call('HGET', metaKey, 'sold_out')
    if isSoldOut == '1' or isSoldOut == 'true' then
      return {'SOLD_OUT', 0, 0, 0, 0}
    end

    -- 1. Expire outdated active sessions
    local expired = redis.call('ZRANGEBYSCORE', expiryKey, '-inf', nowMs)
    for _, sid in ipairs(expired) do
      redis.call('HDEL', activeKey, sid)
      redis.call('ZREM', expiryKey, sid)
    end

    local currentActive = redis.call('HLEN', activeKey)
    local queueLength = redis.call('ZCARD', queueKey)

    -- If no queue exists and active slots are available, admit immediately!
    if queueLength == 0 and currentActive < maxActive then
      local expiresAt = nowMs + durationMs
      redis.call('HSET', activeKey, sessionId, tostring(expiresAt))
      redis.call('ZADD', expiryKey, expiresAt, sessionId)
      redis.call('HINCRBY', metaKey, 'total_admitted', 1)
      return {'ADMITTED', 0, currentActive + 1, 0, expiresAt}
    end

    -- Otherwise, put into waiting queue
    -- Check if session already in queue
    local existingRank = redis.call('ZRANK', queueKey, sessionId)
    if existingRank then
      return {'QUEUED', existingRank, currentActive, queueLength, 0}
    end

    -- Add to queue with score = nowMs
    redis.call('ZADD', queueKey, nowMs, sessionId)
    local rank = redis.call('ZRANK', queueKey, sessionId)
    local newQueueLength = redis.call('ZCARD', queueKey)

    return {'QUEUED', rank, currentActive, newQueueLength, 0}
  `,

  /**
   * ATOMIC ADMISSION BATCH (Used by Admission Worker)
   * KEYS[1]: queue:event:{eventId} (ZSET)
   * KEYS[2]: active:event:{eventId} (HASH)
   * KEYS[3]: active:expiry:{eventId} (ZSET)
   * KEYS[4]: queue:meta:{eventId} (HASH)
   * ARGV[1]: now_ms (integer)
   * ARGV[2]: max_active (integer)
   * ARGV[3]: batch_size (integer)
   * ARGV[4]: session_duration_ms (integer)
   * 
   * Returns:
   * [1] = admitted_count (integer)
   * [2] = current_active (integer)
   * [3] = table of admitted sessionIds
   * [4] = expires_at (integer)
   */
  ADMIT_BATCH: `
    local queueKey = KEYS[1]
    local activeKey = KEYS[2]
    local expiryKey = KEYS[3]
    local metaKey = KEYS[4]

    local nowMs = tonumber(ARGV[1])
    local maxActive = tonumber(ARGV[2])
    local batchSize = tonumber(ARGV[3])
    local durationMs = tonumber(ARGV[4])

    -- Check if paused or sold out
    local isPaused = redis.call('HGET', metaKey, 'is_paused')
    if isPaused == '1' or isPaused == 'true' then
      return {0, 0, {}, 0}
    end
    local isSoldOut = redis.call('HGET', metaKey, 'sold_out')
    if isSoldOut == '1' or isSoldOut == 'true' then
      return {0, 0, {}, 0}
    end

    -- 1. Expire outdated active sessions
    local expired = redis.call('ZRANGEBYSCORE', expiryKey, '-inf', nowMs)
    for _, sid in ipairs(expired) do
      redis.call('HDEL', activeKey, sid)
      redis.call('ZREM', expiryKey, sid)
    end

    local currentActive = redis.call('HLEN', activeKey)
    local availableSlots = maxActive - currentActive
    if availableSlots <= 0 then
      return {0, currentActive, {}, 0}
    end

    local toAdmit = math.min(availableSlots, batchSize)
    if toAdmit <= 0 then
      return {0, currentActive, {}, 0}
    end

    -- 2. Fetch candidates from front of queue (0 to toAdmit - 1)
    local candidates = redis.call('ZRANGE', queueKey, 0, toAdmit - 1)
    local admitted = {}
    local expiresAt = nowMs + durationMs

    for _, sid in ipairs(candidates) do
      redis.call('ZREM', queueKey, sid)
      redis.call('HSET', activeKey, sid, tostring(expiresAt))
      redis.call('ZADD', expiryKey, expiresAt, sid)
      table.insert(admitted, sid)
    end

    if #admitted > 0 then
      redis.call('HINCRBY', metaKey, 'total_admitted', #admitted)
    end

    return {#admitted, currentActive + #admitted, admitted, expiresAt}
  `,

  /**
   * ATOMIC RELEASE ACTIVE
   * KEYS[1]: active:event:{eventId} (HASH)
   * KEYS[2]: active:expiry:{eventId} (ZSET)
   * ARGV[1]: sessionId (string)
   */
  RELEASE_ACTIVE: `
    local activeKey = KEYS[1]
    local expiryKey = KEYS[2]
    local sessionId = ARGV[1]

    local deleted = redis.call('HDEL', activeKey, sessionId)
    redis.call('ZREM', expiryKey, sessionId)
    return deleted
  `,

  /**
   * ATOMIC CLEAN EXPIRED
   * KEYS[1]: active:event:{eventId} (HASH)
   * KEYS[2]: active:expiry:{eventId} (ZSET)
   * ARGV[1]: now_ms (integer)
   */
  CLEAN_EXPIRED: `
    local activeKey = KEYS[1]
    local expiryKey = KEYS[2]
    local nowMs = tonumber(ARGV[1])

    local expired = redis.call('ZRANGEBYSCORE', expiryKey, '-inf', nowMs)
    for _, sid in ipairs(expired) do
      redis.call('HDEL', activeKey, sid)
      redis.call('ZREM', expiryKey, sid)
    end
    return #expired
  `,
};

module.exports = LUA_SCRIPTS;

