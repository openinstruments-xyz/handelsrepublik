import type { ClientRuntime } from '../client-runtime.js';
import { customerOperations } from '../operation-specs.js';
import type { OperationClient } from '../operations.js';
import type { IbanInfo } from '../types.js';

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
  constructor(
    private readonly operations: OperationClient,
    private readonly runtime: ClientRuntime,
  ) {}

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

  async accountUtilization(secAccNo?: string): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    const raw = await this.runtime.raw.query({
      type: 'taxWrapperAccountUtilization',
      secAccNo: accountNumber,
    });
    return this.runtime.validateRaw('tax.accountUtilization', raw);
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

  iban(): Promise<IbanInfo> {
    return this.operations.execute(customerOperations.iban, {});
  }

  rawIban(): Promise<unknown> {
    return this.operations.executeRaw(customerOperations.iban, {});
  }
}
