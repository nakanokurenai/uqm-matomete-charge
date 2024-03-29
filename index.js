const puppeteer = require('puppeteer')
const debug = require('debug')('uq-auto-data-charge')

class UQDataCharge {
  constructor() {
    const debug = this.debug = require('debug')('uq-data-charge')
    debug('constructor')
    this.plans = null
    this.onLogin = false
    this.browser = null
    this.page = null
  }

  destructor() {
    this.debug('destructor')
    return this.browser.close()
  }

  requireLogin () {
    if (!this.onLogin) throw new Error('Login needed!')
  }

  /**
   * @returns Promise<void>
   */
  async login (username, password, retry=0) {
    this.debug('login')

    if (retry > 3) {
      throw new Error('Failed to login!')
    }

    if (this.browser || this.page) throw new Error('The page opened!')
  
    const browser = this.browser = await puppeteer.launch()
    const page = this.page = await browser.newPage()

    await page.goto('https://dc.uqmobile.jp/index')
    await page.evaluate((username, password) => {
      document.getElementById('myUQMobileId').value = username
      document.getElementById('password').value = password
    }, username, password)

    const wait = page.waitForNavigation({
      waitUntil: 'networkidle0'
    })
    const login = await page.$('#login')
    await Promise.all([
      login.click(),
      wait
    ])

    const url = this.page.mainFrame().url()
    if (!url.startsWith('https://dc.uqmobile.jp/home')) {
      const msg = await page.evaluate(() => {
        const elem = document.getElementById('msgPrint')
        return elem ? elem.innerText : null
      })
      if (msg) throw new Error(msg)

      return this.login(username, password, retry+1)
    }
    this.onLogin = true

    this.plans = await this.getPlans()
    return
  }

  /**
   * @returns Promise<Array<ElementHandle>>
   */
  getPlans () {
    this.debug('getPlans')

    return this.page.$$('.plan-item-name')
  }

  /**
   * @returns Promise<ElementHandle>
   */
  async getPlanByName (name) {
    this.debug('getPlanByName')

    this.requireLogin()
    const flags = await Promise.all(
      this.plans.map(plan => this.page.evaluate((plan, name) => {
        return plan.innerText.includes(name)
      }, plan, name)
    ))
    const filtered = this.plans.filter((_, index) => flags[index])
    return filtered[0] || null
  }

  /**
   * @returns Promise<Array<ElementHandle>>
   */
  async openPlanByName (name) {
    this.debug('openPlanByName')

    this.requireLogin()
    const plan = await this.getPlanByName(name)
    if (!plan) return Promise.resolve(false)
  
    return this.page.evaluate((plan) => {
      const buttons = plan.parentNode.getElementsByTagName('button')
      if (buttons.length > 0) {
        buttons[0].click()
        return true
      }
      return false
    }, plan)
  }

  /**
   * @returns Promise<ElementHandle>
   */
  getPurchaseConfirmDialog() {
    this.debug('getPurchaseConfirmDialog')

    this.requireLogin()
    return this.page.$('#purchaseConfirmDialog')
  }

  /**
   * @returns Promise<ElementHandle>
   */
  approveConfirmDialog(dialog) {
    this.debug('approveConfirmDialog')

    this.requireLogin()

    return this.page.evaluate(dialog => {
      const approves = Array.from(dialog.getElementsByTagName('button')).filter(
        v => v.innerText.includes('確定')
      )
      if (approves.length > 0) {
        approves[0].click()
        return true
      }
      return false
    }, dialog)
  }

  async approvePurchase() {
    this.debug('approvePurchase')

    this.requireLogin()
    const dialog = await this.getPurchaseConfirmDialog()
    return this.approveConfirmDialog(dialog)
  }
}

async function main(dc = new UQDataCharge()) {
  await dc.login(process.env.UQ_AUTO_DATA_CHARGE_USERNAME, process.env.UQ_AUTO_DATA_CHARGE_PASSWORD)

  const openResult = await dc.openPlanByName('まとめてチャージ')
  if (!openResult) {
    debug('Already charged!')
    return false
  }

  const result = await dc.approvePurchase()

  return result
}

const dc = new UQDataCharge()
main(dc)
  .then(b => {
    dc.destructor()
    process.exit(b ? 0 : 3)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
