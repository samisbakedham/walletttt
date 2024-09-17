import { fireEvent, render, waitFor } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { getNumberFormatSettings } from 'react-native-localize'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import EarnEnterAmount from 'src/earn/EarnEnterAmount'
import { usePrepareDepositTransactions } from 'src/earn/prepareTransactions'
import { CICOFlow } from 'src/fiatExchanges/utils'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import {
  PreparedTransactionsNotEnoughBalanceForGas,
  PreparedTransactionsPossible,
} from 'src/viem/prepareTransactions'
import networkConfig from 'src/web3/networkConfig'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'
import {
  mockAccount,
  mockArbArbTokenId,
  mockArbEthTokenId,
  mockArbUsdcTokenId,
  mockEarnPositions,
  mockTokenBalances,
} from 'test/values'

jest.mock('src/earn/prepareTransactions')
jest.mock('react-native-localize')
jest.mock('src/statsig') // statsig isn't used directly but the hooksApiSelector uses it

const mockPreparedTransaction: PreparedTransactionsPossible = {
  type: 'possible' as const,
  transactions: [
    {
      from: '0xfrom',
      to: '0xto',
      data: '0xdata',
      gas: BigInt(5e16),
      _baseFeePerGas: BigInt(1),
      maxFeePerGas: BigInt(1),
      maxPriorityFeePerGas: undefined,
    },
    {
      from: '0xfrom',
      to: '0xto',
      data: '0xdata',
      gas: BigInt(1e16),
      _baseFeePerGas: BigInt(1),
      maxFeePerGas: BigInt(1),
      maxPriorityFeePerGas: undefined,
    },
  ],
  feeCurrency: {
    ...mockTokenBalances[mockArbEthTokenId],
    isNative: true,
    balance: new BigNumber(10),
    priceUsd: new BigNumber(1),
    lastKnownPriceUsd: new BigNumber(1),
  },
}

const mockPreparedTransactionNotEnough: PreparedTransactionsNotEnoughBalanceForGas = {
  type: 'not-enough-balance-for-gas' as const,
  feeCurrencies: [
    {
      ...mockTokenBalances[mockArbEthTokenId],
      isNative: true,
      balance: new BigNumber(0),
      priceUsd: new BigNumber(1500),
      lastKnownPriceUsd: new BigNumber(1500),
    },
  ],
}

const mockFeeCurrencies: TokenBalance[] = [
  {
    ...mockTokenBalances[mockArbEthTokenId],
    isNative: true,
    balance: new BigNumber(1),
    priceUsd: new BigNumber(1500),
    lastKnownPriceUsd: new BigNumber(1500),
  },
]

const store = createMockStore({
  tokens: {
    tokenBalances: {
      [mockArbUsdcTokenId]: {
        ...mockTokenBalances[mockArbUsdcTokenId],
        balance: '10',
      },
      mockArbEthTokenId: {
        ...mockTokenBalances[mockArbEthTokenId],
        balance: '1',
      },
      mockArbArbTokenId: {
        ...mockTokenBalances[mockArbArbTokenId],
        minimumAppVersionToSwap: '1.0.0',
        balance: '1',
      },
    },
  },
})

const params = {
  pool: mockEarnPositions[0],
}

describe('EarnEnterAmount', () => {
  const refreshPreparedTransactionsSpy = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(getNumberFormatSettings)
      .mockReturnValue({ decimalSeparator: '.', groupingSeparator: ',' })
    store.clearActions()
    jest.mocked(usePrepareDepositTransactions).mockReturnValue({
      prepareTransactionsResult: undefined,
      refreshPreparedTransactions: refreshPreparedTransactionsSpy,
      clearPreparedTransactions: jest.fn(),
      prepareTransactionError: undefined,
      isPreparingTransactions: false,
    })
  })

  describe('deposit', () => {
    const depositParams = { ...params, mode: 'deposit' }
    it('should show only the deposit token and not include the token dropdown', async () => {
      const { getByTestId, queryByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={depositParams} />
        </Provider>
      )

      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeTruthy()
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toHaveTextContent('USDC')
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeDisabled()
      expect(queryByTestId('downArrowIcon')).toBeFalsy()
    })

    it('should prepare transactions with the expected inputs', async () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={depositParams} />
        </Provider>
      )

      fireEvent.changeText(getByTestId('EarnEnterAmount/TokenAmountInput'), '.25')

      await waitFor(() => expect(refreshPreparedTransactionsSpy).toHaveBeenCalledTimes(1))
      expect(refreshPreparedTransactionsSpy).toHaveBeenCalledWith({
        amount: '0.25',
        token: {
          ...mockTokenBalances[mockArbUsdcTokenId],
          priceUsd: new BigNumber(1),
          lastKnownPriceUsd: new BigNumber(1),
          balance: new BigNumber(10),
        },
        walletAddress: mockAccount.toLowerCase(),
        pool: mockEarnPositions[0],
        hooksApiUrl: networkConfig.hooksApiUrl,
        feeCurrencies: mockFeeCurrencies,
        shortcutId: 'deposit',
      })
    })

    it('should handle navigating to the deposit bottom sheet', async () => {
      jest.mocked(usePrepareDepositTransactions).mockReturnValue({
        prepareTransactionsResult: {
          prepareTransactionsResult: mockPreparedTransaction,
          swapTransaction: undefined,
        },
        refreshPreparedTransactions: jest.fn(),
        clearPreparedTransactions: jest.fn(),
        prepareTransactionError: undefined,
        isPreparingTransactions: false,
      })
      const { getByTestId, getByText } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={depositParams} />
        </Provider>
      )

      fireEvent.changeText(getByTestId('EarnEnterAmount/TokenAmountInput'), '8')

      await waitFor(() => expect(getByText('earnFlow.enterAmount.continue')).not.toBeDisabled())

      expect(getByTestId('EarnEnterAmount/Deposit/Crypto')).toBeTruthy()
      expect(getByTestId('EarnEnterAmount/Deposit/Crypto')).toHaveTextContent('8.00 USDC')

      expect(getByTestId('EarnEnterAmount/Deposit/Fiat')).toBeTruthy()
      expect(getByTestId('EarnEnterAmount/Deposit/Fiat')).toHaveTextContent('₱10.64')

      fireEvent.press(getByText('earnFlow.enterAmount.continue'))

      await waitFor(() => expect(AppAnalytics.track).toHaveBeenCalledTimes(1))
      expect(AppAnalytics.track).toHaveBeenCalledWith(EarnEvents.earn_enter_amount_continue_press, {
        amountEnteredIn: 'token',
        amountInUsd: '8.00',
        networkId: NetworkId['arbitrum-sepolia'],
        tokenAmount: '8',
        depositTokenId: mockArbUsdcTokenId,
        userHasFunds: true,
        providerId: mockEarnPositions[0].appId,
        poolId: mockEarnPositions[0].positionId,
      })
      await waitFor(() => expect(getByText('earnFlow.depositBottomSheet.title')).toBeVisible())
    })
  })

  describe('swap-deposit', () => {
    const swapDepositParams = { ...params, mode: 'swap-deposit' }
    it('should show the token dropdown and allow the user to select a token', async () => {
      const { getByTestId, getAllByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={swapDepositParams} />
        </Provider>
      )

      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeTruthy()
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toHaveTextContent('ETH')
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeEnabled()
      expect(getByTestId('downArrowIcon')).toBeTruthy()
      expect(getAllByTestId('TokenBalanceItem')).toHaveLength(2)
      expect(getAllByTestId('TokenBalanceItem')[0]).toHaveTextContent('ETH')
      expect(getAllByTestId('TokenBalanceItem')[1]).toHaveTextContent('ARB')
      expect(getByTestId('TokenBottomSheet')).not.toHaveTextContent('USDC')
    })

    it('should default to the swappable token if only one is eligible and not show dropdown', async () => {
      const store = createMockStore({
        tokens: {
          tokenBalances: {
            [mockArbUsdcTokenId]: {
              ...mockTokenBalances[mockArbUsdcTokenId],
              balance: '10',
            },
            mockArbEthTokenId: {
              ...mockTokenBalances[mockArbEthTokenId],
              minimumAppVersionToSwap: '1.0.0',
              balance: '0', // not eligible for swap
            },
            mockArbArbTokenId: {
              ...mockTokenBalances[mockArbArbTokenId],
              balance: '1', // eligible for swap
            },
          },
        },
      })

      const { getByTestId, queryByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={swapDepositParams} />
        </Provider>
      )

      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeTruthy()
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toHaveTextContent('ARB')
      expect(getByTestId('EarnEnterAmount/TokenSelect')).toBeDisabled()
      expect(queryByTestId('downArrowIcon')).toBeFalsy()
    })

    it('should prepare transactions with the expected inputs', async () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={EarnEnterAmount} params={swapDepositParams} />
        </Provider>
      )

      fireEvent.changeText(getByTestId('EarnEnterAmount/TokenAmountInput'), '.25')

      await waitFor(() => expect(refreshPreparedTransactionsSpy).toHaveBeenCalledTimes(1))
      expect(refreshPreparedTransactionsSpy).toHaveBeenCalledWith({
        amount: '0.25',
        token: {
          ...mockTokenBalances[mockArbEthTokenId],
          priceUsd: new BigNumber(1500),
          lastKnownPriceUsd: new BigNumber(1500),
          balance: new BigNumber(1),
        },
        walletAddress: mockAccount.toLowerCase(),
        pool: mockEarnPositions[0],
        hooksApiUrl: networkConfig.hooksApiUrl,
        feeCurrencies: mockFeeCurrencies,
        shortcutId: 'swap-deposit',
      })
    })
  })

  // tests independent of deposit / swap-deposit
  it('should show a warning and not allow the user to continue if they input an amount greater than balance', async () => {
    jest.mocked(usePrepareDepositTransactions).mockReturnValue({
      prepareTransactionsResult: {
        prepareTransactionsResult: mockPreparedTransaction,
        swapTransaction: undefined,
      },
      refreshPreparedTransactions: jest.fn(),
      clearPreparedTransactions: jest.fn(),
      prepareTransactionError: undefined,
      isPreparingTransactions: false,
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <MockedNavigator component={EarnEnterAmount} params={params} />
      </Provider>
    )

    fireEvent.changeText(getByTestId('EarnEnterAmount/TokenAmountInput'), '12')

    expect(getByTestId('EarnEnterAmount/NotEnoughBalanceWarning')).toBeTruthy()
    expect(getByTestId('EarnEnterAmount/Continue')).toBeDisabled()
  })

  it('should show loading spinner when preparing transaction', async () => {
    jest.mocked(usePrepareDepositTransactions).mockReturnValue({
      prepareTransactionsResult: undefined,
      refreshPreparedTransactions: jest.fn(),
      clearPreparedTransactions: jest.fn(),
      prepareTransactionError: undefined,
      isPreparingTransactions: true,
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <MockedNavigator component={EarnEnterAmount} params={params} />
      </Provider>
    )

    fireEvent.changeText(getByTestId('EarnEnterAmount/TokenAmountInput'), '8')

    await waitFor(() =>
      expect(getByTestId('EarnEnterAmount/Continue')).toContainElement(
        getByTestId('Button/Loading')
      )
    )
    expect(getByTestId('EarnEnterAmount/Continue')).toBeDisabled()
  })

  describe.each([
    { decimal: '.', group: ',' },
    { decimal: ',', group: '.' },
  ])('with decimal separator "$decimal" and group separator "$group"', ({ decimal, group }) => {
    const replaceSeparators = (value: string) =>
      value.replace(/\./g, '|').replace(/,/g, group).replace(/\|/g, decimal)

    beforeEach(() => {
      jest
        .mocked(getNumberFormatSettings)
        .mockReturnValue({ decimalSeparator: decimal, groupingSeparator: group })
      BigNumber.config({
        FORMAT: {
          decimalSeparator: decimal,
          groupSeparator: group,
          groupSize: 3,
        },
      })
    })

    const mockStore = createMockStore({
      tokens: {
        tokenBalances: {
          [mockArbUsdcTokenId]: {
            ...mockTokenBalances[mockArbUsdcTokenId],
            balance: '100000.42',
          },
        },
      },
    })

    it('entering MAX token applies correct decimal separator', async () => {
      const { getByTestId } = render(
        <Provider store={mockStore}>
          <MockedNavigator component={EarnEnterAmount} params={params} />
        </Provider>
      )

      fireEvent.press(getByTestId('EarnEnterAmount/Max'))
      expect(getByTestId('EarnEnterAmount/TokenAmountInput').props.value).toBe(
        replaceSeparators('100000.42')
      )
      expect(getByTestId('EarnEnterAmount/LocalAmountInput').props.value).toBe(
        replaceSeparators('₱133,000.56')
      )
    })
  })

  it('should track analytics and navigate correctly when tapping cta to add gas', async () => {
    jest.mocked(usePrepareDepositTransactions).mockReturnValue({
      prepareTransactionsResult: {
        prepareTransactionsResult: mockPreparedTransactionNotEnough,
        swapTransaction: undefined,
      },
      refreshPreparedTransactions: jest.fn(),
      clearPreparedTransactions: jest.fn(),
      prepareTransactionError: undefined,
      isPreparingTransactions: false,
    })
    const { getByTestId, getByText } = render(
      <Provider store={store}>
        <MockedNavigator component={EarnEnterAmount} params={params} />
      </Provider>
    )

    await waitFor(() => expect(getByTestId('EarnEnterAmount/NotEnoughForGasWarning')).toBeTruthy())
    fireEvent.press(
      getByText(
        'earnFlow.enterAmount.notEnoughBalanceForGasWarning.noGasCta, {"feeTokenSymbol":"ETH","network":"Arbitrum Sepolia"}'
      )
    )
    expect(AppAnalytics.track).toHaveBeenCalledWith(EarnEvents.earn_deposit_add_gas_press, {
      gasTokenId: mockArbEthTokenId,
    })
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      tokenId: mockArbEthTokenId,
      flow: CICOFlow.CashIn,
      tokenSymbol: 'ETH',
    })
  })
})
