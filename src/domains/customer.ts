import { customerOperations } from '../operation-specs.js';
import type { OperationClient } from '../operations.js';

export class DocumentsApi {
  constructor(private readonly operations: OperationClient) {}

  documents(): Promise<unknown> {
    return this.rawDocuments();
  }

  rawDocuments(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.documents, {});
  }
}

export class TaxApi {
  constructor(private readonly operations: OperationClient) {}

  taxInformation(): Promise<unknown> {
    return this.rawTaxInformation();
  }

  rawTaxInformation(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.taxInformation, {});
  }

  exemptionOrder(): Promise<unknown> {
    return this.rawExemptionOrder();
  }

  rawExemptionOrder(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.exemptionOrder, {});
  }

  taxResidencies(): Promise<unknown> {
    return this.rawTaxResidencies();
  }

  rawTaxResidencies(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.taxResidencies, {});
  }

  taxResidencyCountries(): Promise<unknown> {
    return this.rawTaxResidencyCountries();
  }

  rawTaxResidencyCountries(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.taxResidencyCountries, {});
  }
}

export class PaymentsApi {
  constructor(private readonly operations: OperationClient) {}

  paymentMethods(): Promise<unknown> {
    return this.rawPaymentMethods();
  }

  rawPaymentMethods(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.paymentMethods, {});
  }

  iban(): Promise<unknown> {
    return this.rawIban();
  }

  rawIban(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.iban, {});
  }

  interestDetails(): Promise<unknown> {
    return this.rawInterestDetails();
  }

  rawInterestDetails(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.interestDetails, {});
  }
}
