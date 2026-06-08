const FREE_BASE_QUOTA = 1;
const FREE_MAX_QUOTA = 3;
const PRO_QUOTA = 10;

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function createQuotaManager() {
  const users = new Map();

  function getOrCreate(deviceId, ipHash) {
    const today = todayKey();
    let user = users.get(deviceId);
    if (!user) {
      user = {
        deviceId,
        ipHash,
        lastDate: today,
        dailyQuota: FREE_BASE_QUOTA,
        ideasToday: 0,
        votesToday: 0,
        isPaid: false
      };
      users.set(deviceId, user);
      return user;
    }

    resetIfNeeded(user, today);
    if (ipHash && !user.ipHash) user.ipHash = ipHash;
    return user;
  }

  function resetIfNeeded(user, today = todayKey()) {
    if (user.lastDate === today) return;
    user.lastDate = today;
    user.dailyQuota = user.isPaid ? PRO_QUOTA : FREE_BASE_QUOTA;
    user.ideasToday = 0;
    user.votesToday = 0;
  }

  function recordVote(user) {
    resetIfNeeded(user);
    user.votesToday += 1;
    if (!user.isPaid && user.votesToday >= 30) user.dailyQuota = FREE_MAX_QUOTA;
    else if (!user.isPaid && user.votesToday >= 10) user.dailyQuota = 2;
  }

  function canSubmit(user) {
    resetIfNeeded(user);
    return user.ideasToday < (user.isPaid ? PRO_QUOTA : user.dailyQuota);
  }

  function recordSubmit(user) {
    resetIfNeeded(user);
    user.ideasToday += 1;
  }

  function activatePro(user) {
    resetIfNeeded(user);
    user.isPaid = true;
    user.dailyQuota = PRO_QUOTA;
  }

  return {
    users,
    getOrCreate,
    recordVote,
    canSubmit,
    recordSubmit,
    activatePro
  };
}
