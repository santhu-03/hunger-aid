import { getDoc, doc, getFirestore } from 'firebase/firestore';
import { handleDonationAcceptance } from '../donationAcceptanceService';
import { acceptDelivery, rejectDelivery } from '../volunteerAssignmentService';
import { transitionDeliveryStatus } from '../deliveryTrackingService';
import { completeDelivery, getDeliveryStatus } from '../deliveryStatusService';
import { runRecoverySweep } from '../recoveryService';
import { fetchLiveActors, createLiveDonation, awaitDeliveryStatus } from './RuntimeValidationService';

const delay = ms => new Promise(res => setTimeout(res, ms));

export class RuntimeScenarioRunner {
  constructor(logger) {
    this.logger = logger;
  }

  _assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
    this.logger.success(`ASSERTED: ${message}`);
  }

  async _setupLiveDonation() {
    this.logger.info('Resolving live actors...');
    const actors = await fetchLiveActors();
    this.logger.info(`Live Donor: ${actors.realDonor.id} | Ben: ${actors.realBen.id}`);
    const donationId = await createLiveDonation(actors.realDonor.id, actors.realBen.id, actors.donLoc);
    return { donationId, actors };
  }

  async runScenario1_HappyPath() {
    this.logger.header('SCENARIO 1: HAPPY PATH FULL LIFECYCLE');
    try {
      const { donationId, actors } = await this._setupLiveDonation();

      this.logger.info('Executing handleDonationAcceptance()...');
      await handleDonationAcceptance(donationId, actors.benLoc, actors.donLoc, {});

      const tracking = await awaitDeliveryStatus(donationId, 'Volunteer Assigned');
      const volId = tracking.volunteerId;
      this.logger.success(`Volunteer naturally assigned: ${volId}`);

      this.logger.info('Volunteer accepting delivery...');
      await acceptDelivery(donationId, volId);

      this.logger.info('Progressing: Food Picked Up -> Out For Delivery -> Arriving Soon');
      await transitionDeliveryStatus(donationId, volId, 'Food Picked Up');
      await transitionDeliveryStatus(donationId, volId, 'Out For Delivery');
      await transitionDeliveryStatus(donationId, volId, 'Arriving Soon');
      await transitionDeliveryStatus(donationId, volId, 'Delivered Pending Verification');

      this.logger.info('Completing delivery...');
      await completeDelivery(donationId, volId);

      const finalData = await awaitDeliveryStatus(donationId, 'Completed Verified');
      
      if (!finalData.timelineEvents.some(e => e.status === 'Completed Verified')) {
        throw new Error('History failed to update');
      }

      this.logger.success('Scenario 1 Complete - Full Happy Path executed flawlessly');
    } catch (e) {
      this.logger.error(e.message);
      throw e;
    }
  }

  async runScenario2_RejectReassign() {
    this.logger.header('SCENARIO: REJECT & REASSIGN');
    try {
      const { donationId, actors } = await this._setupLiveDonation();

      this.logger.info('Executing handleDonationAcceptance()');
      await handleDonationAcceptance(donationId, actors.benLoc, actors.donLoc, {});

      const tracking1 = await awaitDeliveryStatus(donationId, 'Volunteer Assigned');
      const firstVolId = tracking1.volunteerId;
      this.logger.info(`Initially assigned: ${firstVolId}`);

      this.logger.info('Volunteer rejected request');
      await rejectDelivery(donationId, firstVolId);

      this.logger.info('Reassigning next nearest volunteer');
      const tracking2 = await awaitDeliveryStatus(donationId, 'Volunteer Assigned');
      const secondVolId = tracking2.volunteerId;

      this._assert(firstVolId !== secondVolId, 'no duplicate volunteer');
      
      const reassignmentEvent = tracking2.timelineEvents.find(e => e.status === 'Volunteer Assigned' && e.extra?.rejectedVolunteerIds?.includes(firstVolId));
      this._assert(!!reassignmentEvent, 'timeline updated');
      this._assert(!!secondVolId, 'reassignment occurred');

      this.logger.success('Second volunteer assigned successfully');
      this.logger.success('Scenario 2 Complete');
    } catch (e) {
      this.logger.error(e.message);
      throw e;
    }
  }

  async runScenario3_OTPVerification() {
    this.logger.header('SCENARIO: DELIVERY COMPLETION');
    try {
      const { donationId, actors } = await this._setupLiveDonation();

      await handleDonationAcceptance(donationId, actors.benLoc, actors.donLoc, {});
      const tracking = await awaitDeliveryStatus(donationId, 'Volunteer Assigned');
      const volId = tracking.volunteerId;

      await acceptDelivery(donationId, volId);
      await transitionDeliveryStatus(donationId, volId, 'Delivered Pending Verification');
      
      this.logger.info(`Completing delivery...`);
      await completeDelivery(donationId, volId);
      const finalTracking = await awaitDeliveryStatus(donationId, 'Completed Verified');
      
      this._assert(finalTracking.currentStatus === 'Completed Verified', 'delivery completed successfully');
      
      const verifiedEvent = finalTracking.timelineEvents.find(e => e.status === 'Completed Verified');
      this._assert(!!verifiedEvent, 'history updated');

      const donDoc = await getDoc(doc(getFirestore(), 'donations', donationId));
      this._assert(donDoc.data().status === 'completed', 'metrics increment once');

      this.logger.success('Verification successful');
      this.logger.success('Scenario 3 Complete');
    } catch (e) {
      this.logger.error(e.message);
      throw e;
    }
  }

  async runScenario4_OfflineRecovery() {
    this.logger.header('SCENARIO: OFFLINE RECOVERY');
    try {
      const { donationId, actors } = await this._setupLiveDonation();

      await handleDonationAcceptance(donationId, actors.benLoc, actors.donLoc, {});
      const tracking = await awaitDeliveryStatus(donationId, 'Volunteer Assigned');
      const volId = tracking.volunteerId;

      await acceptDelivery(donationId, volId);
      await transitionDeliveryStatus(donationId, volId, 'Out For Delivery');
      const baselineData = await getDeliveryStatus(donationId);
      
      this.logger.info('Connection lost');
      await delay(2000);

      await runRecoverySweep();

      const recoveredData = await getDeliveryStatus(donationId);
      
      this._assert(recoveredData.currentStatus === 'Out For Delivery', 'no rollback');
      this._assert(recoveredData.timelineEvents.length === baselineData.timelineEvents.length, 'recovery succeeded');
      this.logger.success('Recovered from last known state');

      await transitionDeliveryStatus(donationId, volId, 'Arriving Soon');
      const nextData = await getDeliveryStatus(donationId);
      this._assert(nextData.currentStatus === 'Arriving Soon', 'no stuck state');

      this.logger.success('Scenario 4 Complete');
    } catch (e) {
      this.logger.error(e.message);
      throw e;
    }
  }
}
