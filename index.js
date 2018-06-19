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

// const $ = cheerio;

mongoose.connect();

const institute = process.env.INSTITUTE;

const SCHEDULE_URL = process.env.SCHEDULE_URI;

// parser for html select
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
    .then(({ name, booked }) => {
      return {
        name, week: week.text, weekNumber: week.value, bookings: booked,
      };
    });
};

const parseTypeGroup = (group, week) => {
  const fileName = n2str('c', group.value);
  const department = 'CMI';
  return fetchHtmlFromUrl(`${SCHEDULE_URL}${department}/kw4/${week.value}/c/${fileName}`)
    .then(scheduleParser)
    .then(parse => parse('c', week))
    .then(({ name, booked }) => {
      return {
        name, week: week.text, weekNumber: week.value, bookings: booked,
      };
    });
};

const parseTypeTutor = (tutor, week) => {
  const fileName = n2str('t', tutor.value);
  const department = 'CMI';
  return fetchHtmlFromUrl(`${SCHEDULE_URL}${department}/kw4/${week.value}/t/${fileName}`)
    .then(scheduleParser)
    .then(parse => parse('t', week))
    .then(({ name, booked }) => {
      return {
        name, week: week.text, weekNumber: week.value, bookings: booked,
      };
    });
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

const groupRoomBookings = (roomWithWeeks, room) => roomWithWeeks.reduce((acc, roomWeek) => {
  return acc ?
    { ...acc, bookings: [...acc.bookings, ...roomWeek.bookings] }
    :
    { ...parseRoom(roomWeek.name, room.text), bookings: roomWeek.bookings };
}, null);


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
      .then((res) => {
        // console.log('----> ', eventName, groupName, 'SUC6');
        return true;
      }).catch(() => true);
  } else {
    return Promise.resolve();
  }
};


const syncRooms = async () => {
  // await Booking.collection.drop();
  // await Event.collection.drop();

  return timeTableSelectors()
    .then(({ rooms, weeks }) => {
      return Promise.reduce(rooms, (acc, room) => {
        return roomWeeks(room, weeks)
          .then((roomWithWeeks) => {
            process.stdout.write('+');
            return [...acc, groupRoomBookings(roomWithWeeks, room)];
          });
      }, []);
    }).then((_result) => {
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

            return Promise.reduce(promises, (total, current) => {
              return current()
                .then((result) => {
                  // console.log(result);
                  return [...total, result];
                });
            }, []);

                // const [{ tutor }] = group;
                // // promises.push()
                // Group.findOne({ name: groupName })
                //   .then(({ _id: groupId }) => {
                //     User.findOne({ short: tutor })
                //       .then((a) => {
                //         let owner = null;
                //         if (a !== null) {
                //           owner = a._id;
                //         }


                //         const event = new Event({
                //           name: eventName,
                //           owner,
                //           groups: [
                //             groupId,
                //           ],
                //         });
                //         event.save().then((savedEvent) => {
                //           const bookings = [];

                //           group.forEach((booking) => {
                //             bookings.push(new Booking({
                //               event: savedEvent._id,
                //               room: roomId,
                //               start: booking.date.start,
                //               end: booking.date.end,
                //             }));
                //           });

                //           Promise.map(bookings, booking => booking.save())
                //             .then((bookingsSaved) => {
                //               savedEvent.bookings = bookingsSaved.map(({ _id }) => _id);
                //               return savedEvent.save();
                //             })
                //             .then(() => {
                //               return 'something';
                //             })
                //             .catch(err => console.log('----> ', err));
                //         });
                //       })
                //       .catch(err => console.log('----> event error: ', err));
                    
                    
                //     // FOUND groupID
                //     // console.log(groupId);
                //   })
                  // .catch((err) => {
                  //   // NO GROUP FOUND
                  //   // console.log('no group found');
                  // });
              })
              .then(() => {
                console.log(`===== ${room} =====`);
                return true;
              });
            });

            // console.log(JSON.stringify(map, null, 2));
          })
          .then((something) => console.log('END', something));
      // });

      // Room.collection.count()
      //   .then((count) => {
      //     if (count === 0) {
      //       Room.collection.insert(res);
      //     } else {
      //       const promises = [];
      //       res.forEach((a) => {
      //         promises.push(Room.collection.findOneAndUpdate({ name: a.name }, a)
      //           .then((ress) => {
      //             if (ress.lastErrorObject && !ress.lastErrorObject.updatedExisting) {
      //               return Room.collection.insert(a);
      //             }
      //           }));
      //       });
      //       return Promise.all(promises)
      //         .then((res) => {
      //           console.log('sync rooms suc6');
      //           return true;
      //         });
      //     }
      //   });
    // }).catch(err => console.log(err));
};

const syncGroups = () => {
  return timeTableSelectors()
    .then(({ weeks, groups }) => {
      return Promise.reduce(groups, (acc, group) => {
        return groupWeeks(group, [weeks[0]])
          .then((groupWithWeeks) => {
            process.stdout.write('+');
            return [...acc, groupRoomBookings(groupWithWeeks, group)];
          });
      }, []);
    }).then((res) => {
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
      //     } else {
      //       const promises = [];
      //       res.forEach((a) => {
      //         promises.push(Group.collection.findOneAndUpdate({ name: a.name }, a)
      //           .then((ress) => {
      //             if (ress.lastErrorObject && !ress.lastErrorObject.updatedExisting) {
      //               return Group.collection.insert(a);
      //             }
      //           }));
      //       });
      //       return Promise.all(promises)
      //         .then((res) => {
      //           console.log('sync groups suc6');
      //           return true;
      //         });
      //     }
      //   });
    }).catch(err => console.log(err));
};

const syncTutors = () => {
  return timeTableSelectors()
    .then(({ weeks, tutors }) => {
      return Promise.reduce(tutors, (acc, tutor) => {
        return tutorWeeks(tutor, [weeks[0]])
          .then((tutorWithWeeks) => {
            process.stdout.write('+');
            return [...acc, groupRoomBookings(tutorWithWeeks, tutor)];
          });
      }, []);
    }).then((res) => {
      const users = res.map(({ name, type }) => (new User({
        name: type,
        short: name,
        role: 'Teacher',
        email: `${name}@hr.nl`,
      })));

      // users.forEach(user => console.log(user));
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
              // process.exit(0);
            });
        });
    }).catch(err => console.log(err));
};

// const parseType = (type, week) => (entity) => {
//   const fileName = n2str(type, entity.value);
//   const department = 'CMI';
//   return request
//     .get(`${SCHEDULE_URL}${department}/kw4/${week.value}/${type}/${fileName}`)
//     .then(resp => scheduleParser(resp, type, week))
//     .then(({ name, booked }) => ({
//       ...parseEntity(entity, type, name),
//       booked,
//       // weeks: [{...week, booked}],
//     }));
// };

syncGroups().then(() => syncTutors()).then(() => syncRooms())
  .then(() => console.log('suc7'))
  .catch(err => console.log(err));

// syncRooms().then(res => console.log('---> ', res));

// syncGroups().then(res => console.log('ending:', res));
// syncTutors().then((res) => {
//   console.log(res.writeErrors);
// });
// Promise.all([
//   syncTutors(),
//   // syncRooms(),
//   // syncGroups(),
// ]).then((res) => {
//   console.log('---> SUC6', res);
//   process.exit(0);
// }).catch(err => console.error(err));

const sync = () => {
  timeTableSelectors()
    .then((obj) => {
      const { classes, weeks, rooms, types } = obj;

      const promises = [];
      const classWeekOneParser = parseType(types.rooms, weeks[0]);
      rooms.forEach(c => promises.push(classWeekOneParser(c)));

      Promise.all(promises).then((response) => {
        // Room.collection.drop()
        Room.collection.insert(response);
        // .then(result => {
        //     console.log('------!> ', result);
        // }).catch(err => console.log(err))
      });

      // Promise.all([
      //     ...classes.map(parseWeek(fileName))
      // ])
      // .then(result => {
      //     return result.reduce((obj, lectures) => {
      //         console.log('----> ', lectures);
      //         // obj[lectures.week.value] =
      //         // return obj
      //     }, {})
      // })
      // .then(result => {

      // })
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
      // weeks: [{...week, booked}],
    })).catch((err) => {
      process.stdout.write('@');
      return parseType(entity);
    });
};

const parseWeek = filename => id => {
  return request
    .get(`${SCHEDULE_URL}CMI/kw4/${week.value}/c/${filename}`)
    .then(scheduleParser)
    .then(lectures => ({
      id,
      lectures,
    }));
};

module.exports = {
  timeTableSelectors,
  sync,
  syncRooms,
};
