import React, { useEffect, useRef, useState } from 'react';
import { PaymentRecoveryModal, PaymentSuccessModal } from './PaymentFlowModals';
import { paymentUxBus } from '../../services/PaymentUxBus';

export default function PaymentSuccessHost() {
  const [visible, setVisible] = useState(false);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);
  const onRecoveryDoneRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    paymentUxBus.registerShowSuccess((onDone) => {
      onDoneRef.current = onDone;
      setVisible(true);
    });
    paymentUxBus.registerShowRecovery((onDone) => {
      onRecoveryDoneRef.current = onDone;
      setRecoveryVisible(true);
    });
    return () => {
      paymentUxBus.unregisterShowSuccess();
      paymentUxBus.unregisterShowRecovery();
    };
  }, []);

  return (
    <>
      <PaymentSuccessModal
        visible={visible}
        onDone={() => {
          setVisible(false);
          onDoneRef.current?.();
          onDoneRef.current = undefined;
        }}
      />
      <PaymentRecoveryModal
        visible={recoveryVisible}
        onDone={() => {
          setRecoveryVisible(false);
          onRecoveryDoneRef.current?.();
          onRecoveryDoneRef.current = undefined;
        }}
      />
    </>
  );
}
