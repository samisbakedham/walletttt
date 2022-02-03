import { fireEvent, render, waitFor } from '@testing-library/react-native'
import * as React from 'react'
import 'react-native'
import LinkBankAccountScreen from 'src/account/LinkBankAccountScreen'
import { KycStatus } from 'src/account/reducer'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { Provider } from 'react-redux'
import { createMockStore } from 'test/utils'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { CICOEvents } from 'src/analytics/Events'
import { mockAccount } from 'test/values'

jest.mock('src/analytics/ValoraAnalytics')

const FAKE_TEMPLATE_ID = 'fake template id'
jest.mock('react-native-persona')
jest.mock('src/firebase/firebase', () => ({
  readOnceFromFirebase: jest.fn(() => FAKE_TEMPLATE_ID),
}))

jest.mock('src/in-house-liquidity', () => ({
  ...(jest.requireActual('src/in-house-liquidity') as any),
  createPersonaAccount: jest.fn(() => Promise.resolve()),
}))

describe('LinkBankAccountScreen: integration tests (using real Persona component, for instance)', () => {
  beforeEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })
  describe('renders correctly for each possible kycStatus', () => {
    const kycValues: (KycStatus | undefined)[] = Object.values(KycStatus)
    kycValues.push(undefined)
    kycValues.forEach((kycValue) => {
      it(`renders correctly for a KycStatus of ${kycValue}`, () => {
        const store = createMockStore({
          web3: { mtwAddress: mockAccount },
          account: { kycStatus: kycValue },
          app: { linkBankAccountStepTwoEnabled: true },
        })
        const { toJSON } = render(
          <Provider store={store}>
            <LinkBankAccountScreen />
          </Provider>
        )
        expect(toJSON()).toMatchSnapshot()
      })
    })
  })
  describe('redirects correctly to SupportContact when button is clicked', async () => {
    it.each([KycStatus.Failed, KycStatus.Declined])(
      'redirects for a KycStatus of %s',
      (kycValue) => {
        const store = createMockStore({
          web3: { mtwAddress: mockAccount },
          account: { kycStatus: kycValue },
        })
        const tree = render(
          <Provider store={store}>
            <LinkBankAccountScreen />
          </Provider>
        )
        fireEvent.press(tree.getByTestId('SupportContactLink'))
        expect(navigate).toBeCalledWith(Screens.SupportContact, {
          prefilledText: 'linkBankAccountScreen.failed.contactSupportPrefill',
        })
      }
    )
  })
  it('switches to the spinner state when the persona button is clicked', async () => {
    const store = createMockStore({
      web3: { mtwAddress: mockAccount },
      account: { kycStatus: undefined },
    })

    const { getByText, getByTestId } = render(
      <Provider store={store}>
        <LinkBankAccountScreen />
      </Provider>
    )
    await waitFor(() => expect(getByTestId('PersonaButton')).not.toBeDisabled())

    fireEvent.press(getByTestId('PersonaButton'))
    await waitFor(() => getByText('linkBankAccountScreen.verifying.title'))
    expect(ValoraAnalytics.track).toHaveBeenCalledWith(CICOEvents.persona_kyc_start)
  })
  describe('step two button', () => {
    it('step two is disabled when feature flag is switched off (even if kyc approved)', async () => {
      const store = createMockStore({
        web3: { mtwAddress: mockAccount },
        account: { kycStatus: KycStatus.Approved },
        app: { linkBankAccountStepTwoEnabled: false },
      })

      const { getByTestId, queryByText } = render(
        <Provider store={store}>
          <LinkBankAccountScreen />
        </Provider>
      )
      const plaidLinkButton = getByTestId('PlaidLinkButton')
      expect(queryByText('linkBankAccountScreen.stepTwo.disabledTitle')).toBeTruthy()
      expect(queryByText('linkBankAccountScreen.stepTwo.disabledDescription')).toBeTruthy()
      expect(queryByText('linkBankAccountScreen.stepTwo.disabledCta')).toBeTruthy()
      expect(plaidLinkButton).toBeDisabled()
    })
    it('step two is disabled when feature flag is switched on and kyc is not approved', async () => {
      const store = createMockStore({
        web3: { mtwAddress: mockAccount },
        account: { kycStatus: KycStatus.Pending },
        app: { linkBankAccountStepTwoEnabled: true },
      })

      const { getByTestId } = render(
        <Provider store={store}>
          <LinkBankAccountScreen />
        </Provider>
      )
      const plaidLinkButton = getByTestId('PlaidLinkButton')
      expect(plaidLinkButton).toBeDisabled()
    })
    it('step two is enabled when feature flag is switched on and kyc is approved', async () => {
      const store = createMockStore({
        web3: { mtwAddress: mockAccount },
        account: { kycStatus: KycStatus.Approved },
        app: { linkBankAccountStepTwoEnabled: true },
      })

      const { getByTestId, queryByText } = render(
        <Provider store={store}>
          <LinkBankAccountScreen />
        </Provider>
      )
      const plaidLinkButton = getByTestId('PlaidLinkButton')
      expect(queryByText('linkBankAccountScreen.stepTwo.title')).toBeTruthy()
      expect(queryByText('linkBankAccountScreen.stepTwo.description')).toBeTruthy()
      expect(queryByText('linkBankAccountScreen.stepTwo.cta')).toBeTruthy()
      expect(plaidLinkButton).not.toBeDisabled()
    })
  })
})
