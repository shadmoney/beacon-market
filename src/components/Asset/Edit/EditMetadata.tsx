import React, { ReactElement, useState } from 'react'
import { Formik } from 'formik'
import {
  LoggerInstance,
  Asset,
  Metadata,
  FixedRateExchange,
  DDO,
  ProviderInstance,
  getHash,
  Nft
} from '@oceanprotocol/lib'
import { validationSchema, getInitialValues } from './_constants'
import { MetadataEditForm } from './_types'
import { useAsset } from '@context/Asset'
import { useWeb3 } from '@context/Web3'
import { useUserPreferences } from '@context/UserPreferences'
import Web3Feedback from '@shared/Web3Feedback'
import FormEditMetadata from './FormEditMetadata'
import { getServiceByName, mapTimeoutStringToSeconds } from '@utils/ddo'
import styles from './index.module.css'
import content from '../../../../content/pages/edit.json'
import { AssetExtended } from 'src/@types/AssetExtended'
import { setMinterToPublisher, setMinterToDispenser } from '@utils/dispenser'
import Debug from 'src/components/Publish/Debug'
import { useAbortController } from '@hooks/useAbortController'

// import Debug from './DebugEditMetadata'

export default function Edit({
  asset
}: {
  asset: AssetExtended
}): ReactElement {
  const { debug } = useUserPreferences()
  const { accountId, web3 } = useWeb3()
  const newAbortController = useAbortController()
  const [success, setSuccess] = useState<string>()
  const [error, setError] = useState<string>()
  const [timeoutStringValue, setTimeoutStringValue] = useState<string>()
  const timeout = asset?.services[0]?.timeout
  const isComputeType = asset?.services[0]?.type === 'compute' ? true : false
  const hasFeedback = error || success

  async function updateFixedPrice(newPrice: string) {
    const fixedRateInstance = new FixedRateExchange(
      web3,
      asset?.accessDetails?.addressOrId
    )
    const setPriceResp = await fixedRateInstance.setRate(
      accountId,
      asset?.accessDetails?.addressOrId,
      newPrice
    )
    LoggerInstance.log('[edit] setFixedRate result', setPriceResp)
    if (!setPriceResp) {
      setError(content.form.error)
      LoggerInstance.error(content.form.error)
    }
  }

  async function handleSubmit(
    values: Partial<MetadataEditForm>,
    resetForm: () => void
  ) {
    try {
      if (asset.accessDetails?.type === 'free') {
        const tx = await setMinterToPublisher(
          web3,
          asset?.accessDetails?.addressOrId,
          asset?.accessDetails?.datatoken?.address,
          accountId,
          setError
        )
        if (!tx) return
      }
      const newMetadata: Metadata = {
        name: values.name,
        description: values.description,
        links: typeof values.links !== 'string' ? values.links : [],
        author: values.author,
        ...asset.metadata
      }
      LoggerInstance.log('[edit] newMetadata', newMetadata)
      asset?.accessDetails?.type === 'fixed' &&
        values.price !== asset.accessDetails.price &&
        (await updateFixedPrice(values.price))

      // let ddoEditedTimeout = newMetadata

      // if (timeoutStringValue !== values.timeout) {
      //   const service =
      //     getServiceByName(ddoEditedMetdata, 'access') ||
      //     getServiceByName(ddoEditedMetdata, 'compute')
      //   const timeout = mapTimeoutStringToSeconds(values.timeout)
      //   ddoEditedTimeout = await ocean.assets.editServiceTimeout(
      //     ddoEditedMetdata,
      //     service.index,
      //     timeout
      //   )
      // }
      // if (!ddoEditedTimeout) {
      //   setError(content.form.error)
      //   LoggerInstance.error(content.form.error)
      //   return
      // }

      const newDdo: DDO = {
        metadata: newMetadata,
        ...asset
      }

      LoggerInstance.log('[edit]  newDdo', newDdo)
      const encryptedDdo = await ProviderInstance.encrypt(
        newDdo,
        newDdo.services[0].serviceEndpoint,
        newAbortController()
      )
      LoggerInstance.log('[edit] Got encrypted DDO', encryptedDdo)

      const metadataHash = getHash(JSON.stringify(newDdo))
      const nft = new Nft(web3)

      const flags = '0x2'

      const setMetadataTx = await nft.setMetadata(
        asset.nftAddress,
        accountId,
        0,
        asset.services[0].serviceEndpoint,
        '',
        flags,
        encryptedDdo,
        '0x' + metadataHash
      )

      LoggerInstance.log('[edit] setMetadata result', setMetadataTx)

      if (!setMetadataTx) {
        setError(content.form.error)
        LoggerInstance.error(content.form.error)
        return
      } else {
        if (asset.accessDetails.type === 'free') {
          const tx = await setMinterToDispenser(
            web3,
            asset?.accessDetails?.datatoken?.address,
            accountId,
            setError
          )
          if (!tx) return
        }
      }
      //Edit succeeded
      setSuccess(content.form.success)
      resetForm()
    } catch (error) {
      LoggerInstance.error(error.message)
      setError(error.message)
    }
  }

  return (
    <Formik
      initialValues={getInitialValues(
        asset?.metadata,
        timeout,
        asset?.accessDetails?.price
      )}
      validationSchema={validationSchema}
      onSubmit={async (values, { resetForm }) => {
        // move user's focus to top of screen
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
        // kick off editing
        await handleSubmit(values, resetForm)
      }}
    >
      {({ isSubmitting, values, initialValues }) =>
        isSubmitting || hasFeedback ? (
          <div />
        ) : (
          <>
            <p className={styles.description}>{content.description}</p>
            <article className={styles.grid}>
              <FormEditMetadata
                data={content.form.data}
                setTimeoutStringValue={setTimeoutStringValue}
                values={initialValues}
                showPrice={asset?.accessDetails?.price?.type === 'exchange'}
                isComputeDataset={isComputeType}
              />

              <aside>
                <Web3Feedback networkId={asset?.chainId} />
              </aside>

              {debug === true && <Debug />}
            </article>
          </>
        )
      }
    </Formik>
  )
}
