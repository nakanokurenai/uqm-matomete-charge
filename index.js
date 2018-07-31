const puppeteer = require('puppeteer')
const debug = require('debug')('uq-auto-data-charge')

class UQDataCharge {
  constructor() {
    const debug = this.debug = require('debug')('uq-data-charge')
    debug('constructor')
    this.plans = null
    this.signedIn = false
    this.browser = null
    this.page = null
  }

  destructor() {
    this.debug('destructor')
    return this.browser.close()
  }

  requireSiqnin () {
    this.debug('requireSiqnin')

    if (!this.signedIn) throw new Error('Login needed!')
  }

  /**
   * @returns Promise<void>
   */
  async signin (username, password) {
    this.debug('signin')

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
      throw new Error('Failed to login')
    }
    this.signedIn = true

    this.plans = await this.getPlans()
    return
  }

  /**
   * @returns Promise<Array<ElementHandle>>
   */
  getPlans () {
    this.debug('getPlans')

    return this.page.$$('plan-item-name')
  }

  /**
   * @returns Promise<ElementHandle>
   */
  async getPlanByName (name) {
    this.debug('getPlanByName')

    this.requireSiqnin()
    const filtered = await this.page.evaluate((plans, name) => {
      return plans.filter(v => v.innerText.includes(name))
    }, this.plans, name)
    return filtered[0] || null
  }

  /**
   * @returns Promise<Array<ElementHandle>>
   */
  async openPlanByName (name) {
    this.debug('openPlanByName')

    this.requireSiqnin()
    const plan = await this.getPlanByName(name)
    if (!plan) throw new Error('No plan to be opened.')
    const button = await this.page.evaluate((plan) => {
      const buttons = plan.parentNode.getElementsByTagName('button')
      if (buttons > 0) return buttons[0]
      return
    }, plan)
    return button.click()
  }

  /**
   * @returns Promise<ElementHandle>
   */
  getPurchaseConfirmDialog() {
    this.debug('getPurchaseConfirmDialog')

    this.requireSiqnin()
    return this.page.$('#purchaseConfirmDialog')
  }

  /**
   * @returns Promise<ElementHandle>
   */
  getApproveButtonByConfirmDialog(dialog) {
    this.debug('getApproveButtionByConfirmDialog')

    this.requireSiqnin()

    return this.page.evaluate(dialog => {
      const approves = Array.from(dialog.getElementsByTagName('button')).filter(
        v => v.innerText.includes('確定')
      )
      if (approves.length > 0) return approves[0]
      return
    }, dialog)
  }

  async approvePurchase() {
    this.debug('approvePurchase')

    this.requireSiqnin()
    const dialog = await this.getPurchaseConfirmDialog()
    const button = await this.getApproveButtonByConfirmDialog(dialog)
    button.click()
  }
}

async function main() {
  const dc = new UQDataCharge()
  await dc.signin(process.env.UQ_AUTO_DATA_CHARGE_USERNAME, process.env.UQ_AUTO_DATA_CHARGE_PASSWORD)
  await dc.openPlanByName('まとめてチャージ')
  await dc.approvePurchase()
  dc.destructor()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
