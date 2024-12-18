import Reservation from "../../../DB/Models/reservation.model.js";
import Table from "../../../DB/Models/table.model.js";
import Meal from "../../../DB/Models/meal.model.js";
import Restaurant from "../../../DB/Models/restaurant.model.js";
import { ErrorClass } from "../../Utils/error-class.utils.js";

/**
 * @api {POST} /reservations/create Create a new Reservation
 */
export const createReservation = async (req, res, next) => {
  const { tableId, mealId, restaurantId, date, time } = req.body;

  if (!tableId || !restaurantId || !date || !time) {
    return next(new ErrorClass("Missing required fields", 400));
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return next(new ErrorClass("Restaurant not found", 404));
  }

  // 3. Check if the table exists and belongs to the restaurant
  const table = await Table.findOne({ _id: tableId, restaurantId });
  if (!table) {
    return next(new ErrorClass("Table not found or does not belong to this restaurant", 404));
  }

  // 4. Check if the table is already reserved at the given date and time
  const existingReservation = await Reservation.findOne({
    tableId,
    date,
    time,
    status: "reserved",
  });
  if (existingReservation) {
    return next(new ErrorClass("Table is already reserved for this time slot", 400));
  }

  if (mealId) {
    const meal = await Meal.findOne({ _id: mealId, restaurantId });
    if (!meal) {
      return next(new ErrorClass("Meal not found or does not belong to this restaurant", 404));
    }
  }

  // 6. Create the reservation
  const reservation = new Reservation({
    userId: req.authUser._id,
    tableId,
    mealId,
    restaurantId,
    date,
    time,
    status: "reserved",
  });

  const newReservation = await reservation.save();

  res.status(201).json({
    status: "success",
    message: "Reservation created successfully",
    reservation: newReservation,
  });
};
/**
 * @api {PUT} /reservations/update/:id Update a Reservation
 */
export const updateReservation = async (req, res, next) => {
  const { id } = req.params; // Reservation ID
  const { date, time, status } = req.body;

  //Find the reservation and check ownership
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    return next(new ErrorClass("Reservation not found", 404));
  }

  if (reservation.userId.toString() !== req.authUser._id.toString()) {
    return next(new ErrorClass("Unauthorized", 403, "You do not own this reservation"));
  }

  if (date || time) {
    const existingReservation = await Reservation.findOne({
      tableId: reservation.tableId,
      date: date || reservation.date,
      time: time || reservation.time,
      status: "reserved",
      _id: { $ne: reservation._id }, // Exclude the current reservation
    });

    if (existingReservation) {
      return next(new ErrorClass("Table is already reserved for the selected time", 400));
    }
  }

  reservation.date = date || reservation.date;
  reservation.time = time || reservation.time;
  reservation.status = status || reservation.status;

  const updatedReservation = await reservation.save();

  res.status(200).json({
    status: "success",
    message: "Reservation updated successfully",
    reservation: updatedReservation,
  });
};
/**
 * @api {DELETE} /reservations/delete/:id  Delete a Reservation
 */
export const deleteReservation = async (req, res, next) => {
  const { id } = req.params; // Extract reservation ID from the URL parameters

  const reservation = await Reservation.findById(id);
  if (!reservation) {
    return next(new ErrorClass("Reservation not found", 404, "Invalid reservation ID"));
  }

  if (reservation.userId.toString() !== req.authUser._id.toString()) {
    return next(new ErrorClass("Unauthorized", 403, "You do not own this reservation"));
  }

  await Reservation.findByIdAndDelete(id);

  res.status(200).json({
    status: "success",
    message: "Reservation deleted successfully",
  });
};

/**
 * @api {GET} /reservations/restaurant/:restaurantId  Get All Reservations for a Restaurant
 */
export const getAllReservationsForRestaurant = async (req, res, next) => {
  const { restaurantId } = req.params; // Extract restaurantId from the URL parameters

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return next(new ErrorClass("Restaurant not found", 404, "Invalid restaurant ID"));
  }

  // 2. Ensure the authenticated user owns the restaurant
  if (restaurant.ownedBy.toString() !== req.authUser._id.toString()) {
    return next(new ErrorClass("Unauthorized", 403, "You are not the owner of this restaurant"));
  }

  const reservations = await Reservation.find({ restaurantId })
    .populate("userId", "name email")
    .populate("tableId", "tableNumber capacity")
    .populate("mealId", "name price")
    .sort({ date: 1, time: 1 }); // Sort by date and time (ascending)

  res.status(200).json({
    status: "success",
    message: "All reservations fetched successfully",
    reservations,
  });
};

/**
 * @api {PATCH} /reservations/:id/status  Update Reservation Status
 * @description Allows the owner of a restaurant to mark a reservation as canceled or completed.
 */
export const updateReservationStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["canceled", "completed"].includes(status)) {
    return next(new ErrorClass("Invalid status value", 400, "Status must be 'canceled' or 'completed'"));
  }

  const reservation = await Reservation.findById(id).populate("restaurantId");
  if (!reservation) {
    return next(new ErrorClass("Reservation not found", 404, "Invalid reservation ID"));
  }

  const restaurant = reservation.restaurantId;
  if (!restaurant) {
    return next(new ErrorClass("Restaurant not found", 404, "Restaurant associated with this reservation is invalid"));
  }

  if (restaurant.ownedBy.toString() !== req.authUser._id.toString()) {
    return next(new ErrorClass("Unauthorized", 403, "You are not the owner of this restaurant"));
  }

  reservation.status = status;
  const updatedReservation = await reservation.save();

  res.status(200).json({
    status: "success",
    message: `Reservation marked as '${status}' successfully`,
    reservation: updatedReservation,
  });
};
/**
 * @api {GET} /reservations/user Get All Reservations for a User
 */
export const getAllReservationsForUser = async (req, res, next) => {
  const reservations = await Reservation.find({ userId: req.authUser._id })
    .populate("restaurantId", "name address")
    .populate("tableId", "tableNumber capacity")
    .populate("mealId", "name price");

  res.status(200).json({
    status: "success",
    message: "All reservations for the user fetched successfully",
    reservations,
  });
};

/**
 * @api {GET} /reservations/table/:tableId Fetch all reservations for a specific table
 */
export const getReservationsForTable = async (req, res, next) => {
  const { tableId } = req.params;

  const reservations = await Reservation.find({ tableId })
    .populate("userId", "name email")
    .populate("restaurantId", "name address")
    .sort({ date: 1, time: 1 });

  // Check if the user is either the table owner or the user who reserved
  const filteredReservations = reservations.filter(
    (reservation) =>
      reservation.userId.toString() === req.authUser._id.toString() ||
      reservation.restaurantId.ownedBy.toString() === req.authUser._id.toString()
  );

  if (!filteredReservations.length) {
    return next(new ErrorClass("Unauthorized", 403, "You are not authorized to view these reservations"));
  }

  res.status(200).json({
    status: "success",
    message: "Reservations for the table fetched successfully",
    reservations: filteredReservations,
  });
};

/**
 * @api {GET} /reservations/:id Fetch details of a specific reservation by its ID
 */
export const getSpecificReservation = async (req, res, next) => {
  const { id } = req.params;

  const reservation = await Reservation.findById(id)
    .populate("userId", "name email")
    .populate("restaurantId", "name address")
    .populate("tableId", "tableNumber capacity")
    .populate("mealId", "name price");

  if (!reservation) {
    return next(new ErrorClass("Reservation not found", 404));
  }

  // Check if the user is either the restaurant owner or the reservation maker
  if (
    reservation.userId.toString() !== req.authUser._id.toString() &&
    reservation.restaurantId.ownedBy.toString() !== req.authUser._id.toString()
  ) {
    return next(new ErrorClass("Unauthorized", 403, "You are not authorized to view this reservation"));
  }

  res.status(200).json({
    status: "success",
    message: "Reservation details fetched successfully",
    reservation,
  });
};