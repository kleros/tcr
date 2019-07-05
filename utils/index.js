const pify = require('pify')
const ethAsync = pify(web3.eth)
const { getBlock: ethGetBlock } = ethAsync

// Returns the time of the last mined block in seconds
async function latestTime() {
  const block = await ethGetBlock('latest')
  return block.timestamp
}

// Increases ganache time by the passed duration in seconds
function increaseTime(duration) {
  const id = Date.now()

  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [duration],
        id: id
      },
      err1 => {
        if (err1) return reject(err1)

        web3.currentProvider.sendAsync(
          {
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: id + 1
          },
          (err2, res) => {
            return err2 ? reject(err2) : resolve(res)
          }
        )
      }
    )
  })
}

/**
 * Beware that due to the need of calling two separate ganache methods and rpc calls overhead
 * it's hard to increase time precisely to a target point so design your test to tolerate
 * small fluctuations from time to time.
 *
 * @param target time in seconds
 */
async function increaseTimeTo(target) {
  const now = await latestTime()

  if (target < now)
    throw Error(
      `Cannot increase current time(${now}) to a moment in the past(${target})`
    )
  const diff = target - now
  return increaseTime(diff)
}

const duration = {
  seconds: function(val) {
    return val
  },
  minutes: function(val) {
    return val * this.seconds(60)
  },
  hours: function(val) {
    return val * this.minutes(60)
  },
  days: function(val) {
    return val * this.hours(24)
  },
  weeks: function(val) {
    return val * this.days(7)
  },
  years: function(val) {
    return val * this.days(365)
  }
}

async function expectThrow(promise, message) {
  try {
    await promise
  } catch (error) {
    // Message is an optional parameter here
    if (message) {
      assert(
        error.message.search(message) >= 0,
        "Expected '" + message + "', got '" + error + "' instead"
      )
      return
    } else {
      // TODO: Check jump destination to destinguish between a throw
      //       and an actual invalid jump.
      const invalidOpcode = error.message.search('invalid opcode') >= 0
      // TODO: When we contract A calls contract B, and B throws, instead
      //       of an 'invalid jump', we get an 'out of gas' error. How do
      //       we distinguish this from an actual out of gas event? (The
      //       ganache log actually show an 'invalid jump' event.)
      const outOfGas = error.message.search('out of gas') >= 0
      const revert = error.message.search('revert') >= 0
      assert(
        invalidOpcode || outOfGas || revert,
        "Expected throw, got '" + error + "' instead"
      )
      return
    }
  }
  assert.fail('Expected throw not received')
}

module.exports = {
  expectThrow,
  increaseTime,
  increaseTimeTo,
  duration
}
