import {WorkerEntrypoint} from 'cloudflare:workers';
import {readInquiryQueue} from './inquiryQueue';
export {default} from './worker';

// Only a private service binding can select this entrypoint.
export class H2InquiryQueue extends WorkerEntrypoint {
  fetch(request) {
    return readInquiryQueue(request, this.env);
  }
}
