import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, doc, setDoc, query, where, limit, onSnapshot } from 'firebase/firestore';
import { GymEvent, GymChallenge } from '../../types';
import { INITIAL_EVENTS, INITIAL_CHALLENGES } from '../../services/db';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { Calendar, Trophy, Users, CheckCircle, Clock, MapPin, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export const EventsChallengesView: React.FC = () => {
  const { currentUser } = useAuth();
  const [events, setEvents] = useState<GymEvent[]>(() =>
    getCachedData<GymEvent[]>('gym_events', INITIAL_EVENTS)
  );
  const [challenges, setChallenges] = useState<GymChallenge[]>(() =>
    getCachedData<GymChallenge[]>('gym_challenges', INITIAL_CHALLENGES)
  );
  const [registeredEventIds, setRegisteredEventIds] = useState<string[]>([]);
  const [joinedChallengeIds, setJoinedChallengeIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'events' | 'challenges'>('events');

  useEffect(() => {
    // 1. Load events (bounded by limit(25))
    const unsubEvents = onSnapshot(
      query(collection(db, 'events'), limit(25)),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GymEvent));
          setEvents(list);
          setCachedData('gym_events', list);
        }
      },
      (err) => console.warn('Events listener note:', err)
    );

    // 2. Load challenges (bounded by limit(25))
    const unsubChallenges = onSnapshot(
      query(collection(db, 'challenges'), limit(25)),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GymChallenge));
          setChallenges(list);
          setCachedData('gym_challenges', list);
        }
      },
      (err) => console.warn('Challenges listener note:', err)
    );

    if (currentUser?.uid) {
      // 3. Check client event registrations
      const regQuery = query(
        collection(db, 'eventRegistrations'),
        where('clientId', '==', currentUser.uid),
        limit(25)
      );
      const unsubReg = onSnapshot(
        regQuery,
        (snap) => {
          setRegisteredEventIds(snap.docs.map((d) => d.data().eventId));
        },
        (err) => console.warn('Event registrations listener note:', err)
      );

      // 4. Check client challenge participations
      const partQuery = query(
        collection(db, 'challengeParticipations'),
        where('clientId', '==', currentUser.uid),
        limit(25)
      );
      const unsubPart = onSnapshot(
        partQuery,
        (snap) => {
          setJoinedChallengeIds(snap.docs.map((d) => d.data().challengeId));
        },
        (err) => console.warn('Challenge participations listener note:', err)
      );

      return () => {
        unsubEvents();
        unsubChallenges();
        unsubReg();
        unsubPart();
      };
    }

    return () => {
      unsubEvents();
      unsubChallenges();
    };
  }, [currentUser?.uid]);

  const handleRegisterEvent = async (event: GymEvent) => {
    if (!currentUser) return;
    try {
      const regId = `reg_${event.id}_${currentUser.uid}`;
      await setDoc(doc(db, 'eventRegistrations', regId), {
        id: regId,
        eventId: event.id,
        clientId: currentUser.uid,
        clientName: currentUser.displayName,
        registeredAt: new Date().toISOString()
      });
      setRegisteredEventIds(prev => [...prev, event.id]);
      try {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      alert('Event registration error: ' + err.message);
    }
  };

  const handleJoinChallenge = async (challenge: GymChallenge) => {
    if (!currentUser) return;
    try {
      const partId = `part_${challenge.id}_${currentUser.uid}`;
      await setDoc(doc(db, 'challengeParticipations', partId), {
        id: partId,
        challengeId: challenge.id,
        clientId: currentUser.uid,
        clientName: currentUser.displayName,
        joinedAt: new Date().toISOString()
      });
      setJoinedChallengeIds(prev => [...prev, challenge.id]);
      try {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      alert('Error joining challenge: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 pb-20 text-slate-700">
      {/* Header Banner */}
      <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-1 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 font-bold bg-cyan-500/15 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              Community Hub
            </span>
            <h2 className="text-lg font-black text-slate-800 mt-1.5 tracking-tight">Events & Challenges</h2>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 text-orange-500 font-bold flex items-center justify-center">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed mt-1">
          Join competitions, bootcamps and fitness milestones organized by Torrent Fitness.
        </p>
      </div>

      {/* Switcher */}
      <div className="flex bg-[#E2EAF3] p-1 rounded-2xl border border-white/80">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'events'
              ? 'clay-btn-sunset text-white text-slate-800 text-slate-800 shadow-md shadow-cyan-500/20 border border-cyan-400/30'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Gym Events</span>
        </button>
        <button
          onClick={() => setActiveTab('challenges')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'challenges'
              ? 'clay-btn-sunset text-white text-slate-800 text-slate-800 shadow-md shadow-cyan-500/20 border border-cyan-400/30'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Challenges</span>
        </button>
      </div>

      {activeTab === 'events' ? (
        /* Events Section */
        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="p-8 text-center clay-surface rounded-3xl border border-white/80 text-slate-600">
              No upcoming gym events scheduled. Check back soon!
            </div>
          ) : (
            events.map((evt) => {
              const isRegistered = registeredEventIds.includes(evt.id);
              return (
                <div
                  key={evt.id}
                  className="clay-surface rounded-3xl p-5 border border-white/80 shadow-md space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      {/* Registration ON/OFF badge */}
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          evt.registrationEnabled
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#E2EAF3] text-slate-600 border-white/80'
                        }`}
                      >
                        {evt.registrationEnabled ? 'Registration Open' : 'Information Only (Reg Off)'}
                      </span>
                      <h3 className="text-sm font-bold text-slate-800 mt-1.5">{evt.title}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{evt.description}</p>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-orange-500 font-bold" />
                      <span>{evt.eventDate} at {evt.eventTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-500 font-bold" />
                      <span className="truncate">{evt.location}</span>
                    </div>
                  </div>

                  {/* Registration Action */}
                  <div className="pt-2 border-t border-white/80">
                    {evt.registrationEnabled ? (
                      isRegistered ? (
                        <div className="w-full py-2 bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span>You are Registered for this Event</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRegisterEvent(evt)}
                          className="w-full py-2.5 clay-btn-sunset text-white text-slate-800 hover:from-cyan-400 hover:to-blue-500 text-slate-800 text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>Register Free</span>
                        </button>
                      )
                    ) : (
                      <p className="text-[11px] text-slate-600 text-center italic">
                        Viewing only. No advance registration required for this session.
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Challenges Section */
        <div className="space-y-3">
          {challenges.length === 0 ? (
            <div className="p-8 text-center clay-surface rounded-3xl border border-white/80 text-slate-600">
              No active challenges right now. Stay tuned!
            </div>
          ) : (
            challenges.map((ch) => {
              const isJoined = joinedChallengeIds.includes(ch.id);
              return (
                <div
                  key={ch.id}
                  className="clay-surface rounded-3xl p-5 border border-white/80 shadow-md space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-600 font-bold border border-amber-500/30">
                        {ch.target}
                      </span>
                      <h3 className="text-sm font-bold text-slate-800 mt-1.5">{ch.title}</h3>
                    </div>
                    <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{ch.description}</p>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                    <span>Duration: {ch.startDate} to {ch.endDate}</span>
                    <span className="font-semibold text-amber-600 font-bold flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {ch.participantsCount + (isJoined ? 1 : 0)} Participants
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/80">
                    {isJoined ? (
                      <div className="w-full py-2 bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Enrolled & Tracking</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleJoinChallenge(ch)}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-800 text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Join Gym Challenge</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
