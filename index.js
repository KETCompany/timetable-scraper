require('dotenv').config();

const request = require('request-promise-native');
const cheerio = require('cheerio');
// const fs = require('fs');
const Promise = require('bluebird');

const mongoose = require('./src/config/mongoose');
const scheduleParser = require('./src/utils/schedule-parser');
const Room = require('./src/models/room.model');
const Group = require('./src/models/group.model');
const Tutor = require('./src/models/tutor.model');
const User = require('./src/models/user.model');
const Event = require('./src/models/event.model');
const Booking = require('./src/models/booking.model');

const { parseJSObject, n2str, fetchHtmlFromUrl } = require('./src/helpers');


mongoose.connect();


const SCHEDULE_URL = process.env.SCHEDULE_URI;
const parseSelector = elem =>
  elem
    .children()
    .map((i, el) => {
      const obj = cheerio(el)[0].attribs;
      obj.text = cheerio(el).text();
      return obj;
    })
    .get();


const extractTimeTableWeeks = $ => parseSelector($('[name=week]'));
const extractTimeTableTypes = $ => parseSelector($('[name=type]'))
  .reduce((acc, cur) => {
    let id;
    if (cur.text === 'Klassen') {
      id = 'classes';
    } else if (cur.text === 'Docenten') {
      id = 'tutors';
    } else {
      id = 'rooms';
    }
    acc[id] = cur.value;
    return acc;
  }, {});

const extractScriptJson = $ => $($('script')[1])[0].children[0].data;


const timeTableSelectors = () =>
  fetchHtmlFromUrl(`${SCHEDULE_URL}CMI/kw4/frames/navbar.htm`)
    .then(($) => {
      const weeks = extractTimeTableWeeks($);
      const types = extractTimeTableTypes($);
      const jsText = extractScriptJson($);

      const [classes, teachers, rooms] = ['classes', 'teachers', 'rooms'].map(type =>
        parseJSObject(type, jsText));

      return {
        weeks,
        types,
        groups: classes,
        tutors: teachers,
        rooms,
      };
    });

const parseRoom = (name, roomId) => {
  const roomSplitted = roomId.split('.');
  if (roomSplitted.length > 1) {
    const [location, floor, number] = roomSplitted;
    return {
      location,
      displayKeys: [],
      floor: parseInt(floor, 10),
      number: parseInt(number, 10),
      name: roomId,
      type: name,
    };
  }

  return { name: roomSplitted[0], type: name };
};

const parseEntity = (entity, type, name) => {
  if (type === 'r') {
    return { type: name, ...parseRoom(entity) };
  }
};

const parseTypeRoom = (room, week) => {
  const fileName = n2str('r', room.value);
  const department = 'CMI';
  return fetchHtmlFromUrl(`${SCHEDULE_URL}${department}/kw4/${week.value}/r/${fileName}`)
    .then(scheduleParser)
    .then(parse => parse('r', week))
    .then(({ name, booked }) => ({
      name, week: week.text, weekNumber: week.value, bookings: booked,
    }));
};

const parseTypeGroup = (group, week) => {
  const fileName = n2str('c', group.value);
  const department = 'CMI';
  return fetchHtmlFromUrl(`${SCHEDULE_URL}${department}/kw4/${week.value}/c/${fileName}`)
    .then(scheduleParser)
    .then(parse => parse('c', week))
    .then(({ name, booked }) => ({
      name, week: week.text, weekNumber: week.value, bookings: booked,
    }));
};

const parseTypeTutor = (tutor, week) => {
  const fileName = n2str('t', tutor.value);
  const department = 'CMI';
  return fetchHtmlFromUrl(`${SCHEDULE_URL}${department}/kw4/${week.value}/t/${fileName}`)
    .then(scheduleParser)
    .then(parse => parse('t', week))
    .then(({ name, booked }) => ({
      name, week: week.text, weekNumber: week.value, bookings: booked,
    }));
};

const roomWeeks = (room, weeks) => {
  const promises = [];
  weeks.forEach((week) => {
    promises.push(parseTypeRoom(room, week));
  });
  return Promise.all(promises);
};

const groupWeeks = (group, weeks) => {
  const promises = [];
  weeks.forEach((week) => {
    promises.push(parseTypeGroup(group, week));
  });
  return Promise.all(promises);
};

const tutorWeeks = (tutor, weeks) => {
  const promises = [];
  weeks.forEach((week) => {
    promises.push(parseTypeTutor(tutor, week));
  });
  return Promise.all(promises);
};

const groupRoomBookings = (roomWithWeeks, room) => roomWithWeeks.reduce((acc, roomWeek) => (acc ?
  { ...acc, bookings: [...acc.bookings, ...roomWeek.bookings] }
  :
  { ...parseRoom(roomWeek.name, room.text), bookings: roomWeek.bookings }), null);


const createEvent = (roomId, eventName, groupName, groupBookings) => {
  let groupId = null;
  let ownerId = null;

  if (groupBookings && groupBookings.length > 0) {
    const [{ tutor }] = groupBookings;

    return Group.findOne({ name: groupName })
      .then((group) => {
        if (group && group.id) {
          groupId = group.id;
        }
        return User.findOne({ short: tutor });
      })
      .then((user) => {
        if (user && user.id) {
          ownerId = user.id;
        }

        const event = new Event({
          name: eventName,
          owner: ownerId,
          groups: groupId ? [groupId] : [],
        });

        return event.save();
      })
      .then(event =>
        Promise.map(groupBookings, booking =>
          new Booking({
            event: event.id,
            room: roomId,
            start: booking.date.start,
            end: booking.date.end,
          }).save())
          .then((bookings) => {
            event.bookings = bookings.map(({ id }) => id);
            return event.save();
          }))
      .then(res => true)
      .catch(() => true);
  }
  return Promise.resolve();
};


const syncRooms = async () => timeTableSelectors()
  .then(({ rooms, weeks }) => Promise.reduce(rooms, (acc, room) => roomWeeks(room, weeks)
    .then((roomWithWeeks) => {
      process.stdout.write('+');
      return [...acc, groupRoomBookings(roomWithWeeks, room)];
    }), [])).then((_result) => {
    Promise.reduce(_result, (acc, res) => {
      const { bookings, ...room } = res;


      // const { name: room } = res;
      // console.log(res);
      return Room.create(room)
        .then(({ _id: roomId }) => {
          console.log('Working on: ', roomId);

          const map = {};

          res.bookings.forEach((element) => {
            let { name, group } = element;

            if (name === '' && group === '') {
              name = 'noName';
              group = 'noGroup';
            }

            if (map[name]) {
              if (map[name][group]) {
                map[name][group] = [...map[name][group], element];
              } else {
                map[name][group] = [element];
              }
            } else if (group) {
              map[name] = {
                [group]: [element],
              };
            } else {
              map[name] = [element];
            }
          });


          const promises = [];

          Object.entries(map).forEach(([eventName, groups]) => {
            Object.entries(groups).forEach(([groupName, group]) => {
              if (group && group.length > 0) {
                promises.push(() => createEvent(roomId, eventName, groupName, group));
              }
            });
          });

          return Promise.reduce(promises, (total, current) => current()
            .then(result =>
            // console.log(result);
              [...total, result]), []);
        })
        .then(() => {
          console.log(`===== ${room} =====`);
          return true;
        });
    });
  })
  .then(something => console.log('END', something));

const syncGroups = () => timeTableSelectors()
  .then(({ weeks, groups }) => Promise.reduce(groups, (acc, group) => groupWeeks(group, [weeks[0]])
    .then((groupWithWeeks) => {
      process.stdout.write('+');
      return [...acc, groupRoomBookings(groupWithWeeks, group)];
    }), [])).then((res) => {
    const groups = res.map(({ name, type }) =>
      new Group({
        name,
        description: type,
      }));

    return Group.collection.count()
      .then((count) => {
        if (count === 0) {
          Group.collection.insert(groups);
        }
      });
  }).catch(err => console.log(err));

const syncTutors = () => timeTableSelectors()
  .then(({ weeks, tutors }) => Promise.reduce(tutors, (acc, tutor) => tutorWeeks(tutor, [weeks[0]])
    .then((tutorWithWeeks) => {
      process.stdout.write('+');
      return [...acc, groupRoomBookings(tutorWithWeeks, tutor)];
    }), [])).then((res) => {
    const users = res.map(({ name, type }) => (new User({
      name: type,
      short: name,
      role: 'Teacher',
      email: `${name}@hr.nl`,
    })));

    return User.collection.count()
      .then((count) => {
        if (count === 0) {
          return User.collection.insert(users);
        }

        const promises = [];
        users.forEach(({ _id, ...a }) => {
          promises.push(User.collection.findOneAndUpdate({ name: a.name }, a)
            .then((ress) => {
              if (ress.lastErrorObject && !ress.lastErrorObject.updatedExisting) {
                return Group.collection.insert(a);
              }
            }));
        });

        return Promise.all(promises)
          .then((res) => {
            console.log('sync tutors suc6');
            return true;
          });
      });
  }).catch(err => console.log(err));


syncGroups().then(() => syncTutors()).then(() => syncRooms())
  .then(() => console.log('suc7'))
  .catch(err => console.log(err));


const sync = () => {
  timeTableSelectors()
    .then((obj) => {
      const {
        classes, weeks, rooms, types,
      } = obj;

      const promises = [];
      const classWeekOneParser = parseType(types.rooms, weeks[0]);
      rooms.forEach(c => promises.push(classWeekOneParser(c)));

      Promise.all(promises).then((response) => {
        Room.collection.insert(response);
      });
    })
    .catch(console.log);
};

const parseType = (type, week) => (entity) => {
  const fileName = n2str(type, entity.value);
  const department = 'CMI';
  return request
    .get(`${SCHEDULE_URL}${department}/kw4/${week.value}/${type}/${fileName}`)
    .then(resp => scheduleParser(resp, type, week))
    .then(({ name, booked }) => ({
      ...parseEntity(entity, type, name),
      booked,
    })).catch((err) => {
      process.stdout.write('@');
      return parseType(entity);
    });
};
